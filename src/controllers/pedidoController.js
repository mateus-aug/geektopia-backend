const { Preference, Payment } = require('mercadopago');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { lerId } = require('../utils/validadores');
const { MAX_INGRESSOS_POR_PEDIDO, validarTitular, idadeExigida, limiteDoLote } = require('../utils/titulares');
const { client, baseUrl, frontendUrl } = require('../services/paymentService');
const { confirmarPagamentoAprovado } = require('../services/confirmacaoPagamento');
const { validarAssinaturaWebhook } = require('../services/webhookMercadoPago');

// Monta a resposta de um pedido, convertendo os Decimal do Prisma (pedido,
// itens e pagamento) em número comum, igual ao padrão usado no restante da API.
function montarRespostaPedido(pedido) {
  const { itens, pagamento, ...campos } = pedido;

  return {
    ...campos,
    valor_total_bruto: campos.valor_total_bruto === null ? null : Number(campos.valor_total_bruto),
    itens: (itens || []).map((item) => ({
      ...item,
      preco_unitario_momento: item.preco_unitario_momento === null ? null : Number(item.preco_unitario_momento),
      subtotal: item.subtotal === null ? null : Number(item.subtotal)
    })),
    pagamento: pagamento ? { ...pagamento, valor_total: Number(pagamento.valor_total) } : null
  };
}

// 1. CRIAR PEDIDO
//
// O preço de cada item SEMPRE vem do lote consultado no banco, nunca do que o
// cliente mandou no corpo da requisição. Se confiássemos no "preco_unitario"
// enviado pelo front, bastaria alterar a requisição (ex.: DevTools/Postman)
// para pagar qualquer valor pelo ingresso.
exports.criarPedido = async (req, res) => {
  try {
    const id_usuario = req.userId;
    const { itens } = req.body;

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'É necessário informar ao menos um item para o pedido.' });
    }

    const idsLote = itens.map((item) => lerId(item.id_lote));

    if (idsLote.some((id) => id === null)) {
      return res.status(400).json({ error: 'Todo item do pedido precisa de um "id_lote" válido.' });
    }

    const lotes = await prisma.lote.findMany({
      where: { id_lote: { in: idsLote } },
      include: {
        geektopia: { select: { status_evento: true, classificacao_etaria: true } },
        _count: { select: { ingressos: true } }
      }
    });
    const lotesPorId = new Map(lotes.map((lote) => [lote.id_lote, lote]));

    // Limite de ingressos por compra (evita cambismo e erro de digitação).
    const totalNoPedido = itens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
    if (totalNoPedido > MAX_INGRESSOS_POR_PEDIDO) {
      return res.status(400).json({ error: `Cada compra pode ter no máximo ${MAX_INGRESSOS_POR_PEDIDO} ingressos.` });
    }

    let valorTotal = 0;
    const documentosPorLote = new Map(); // id_lote -> { documento: quantidade } dentro deste pedido
    const itensParaCriar = [];
    const itensParaPreferencia = [];

    for (const item of itens) {
      const idLote = lerId(item.id_lote);
      const quantidade = Number(item.quantidade);
      const lote = lotesPorId.get(idLote);

      if (!Number.isInteger(quantidade) || quantidade <= 0) {
        return res.status(400).json({ error: `Quantidade inválida para o lote ${idLote}.` });
      }

      if (!lote) {
        return res.status(404).json({ error: `Lote de ingressos ${idLote} não encontrado.` });
      }

      if (lote.geektopia.status_evento !== 'VendasAbertas') {
        return res.status(409).json({ error: `As vendas do lote "${lote.nome_lote}" não estão abertas no momento.` });
      }

      // A trigger de baixa de estoque (Quadro 50 do PDF) ainda não existe, então
      // "quantidade_total" não desconta sozinho a cada venda (mesmo comentário
      // já feito em loteController.js). Contamos os ingressos já emitidos para
      // saber quanto ainda resta e não vender além da capacidade do lote.
      if (lote.quantidade_total !== null) {
        const restante = lote.quantidade_total - lote._count.ingressos;
        if (quantidade > restante) {
          return res.status(409).json({
            error: `Restam apenas ${Math.max(restante, 0)} ingresso(s) no lote "${lote.nome_lote}".`
          });
        }
      }

      // Lote com limite por pessoa (ou meia-entrada, 1 por pessoa): a compra não pode passar desse número,
      // como nas plataformas de ingresso. A tela já trava a seleção; aqui garantimos para quem burlar a tela.
      const limiteDaCompra = limiteDoLote(lote);
      if (limiteDaCompra && quantidade > limiteDaCompra) {
        return res.status(400).json({ error: `O ingresso "${lote.nome_lote}" é limitado a ${limiteDaCompra} por compra.`, campo: 'quantidade' });
      }

      // Cada ingresso sai em nome de um titular (nome, documento e nascimento).
      if (!Array.isArray(item.titulares) || item.titulares.length !== quantidade) {
        return res.status(400).json({ error: `Informe os dados dos ${quantidade} titular(es) do lote "${lote.nome_lote}".` });
      }

      const idadeMin = idadeExigida(lote, lote.geektopia);
      const limite = limiteDoLote(lote);
      const contagem = documentosPorLote.get(idLote) || {};
      const titularesValidos = [];

      for (let i = 0; i < item.titulares.length; i += 1) {
        const r = validarTitular(item.titulares[i], i + 1);
        if (r.erro) return res.status(400).json({ error: `${lote.nome_lote} — ${r.erro}`, campo: 'titulares' });
        const t = r.valor;

        if (idadeMin && t.idade < idadeMin) {
          return res.status(400).json({
            error: `${t.nome_completo} tem ${t.idade} anos, e o ingresso "${lote.nome_lote}" exige ${idadeMin}+ anos.`,
            campo: 'titulares'
          });
        }

        contagem[t.documento] = (contagem[t.documento] || 0) + 1;
        if (limite) {
          const jaTem = await prisma.ingresso.count({
            where: { id_lote: idLote, documento_titular: t.documento, status_ingresso: { not: 'Cancelado' } }
          });
          if (jaTem + contagem[t.documento] > limite) {
            return res.status(409).json({
              error: `O ingresso "${lote.nome_lote}" é limitado a ${limite} por pessoa (documento ${t.documento}).`,
              campo: 'titulares'
            });
          }
        }

        const { idade, ...guardar } = t;
        titularesValidos.push(guardar);
      }
      documentosPorLote.set(idLote, contagem);

      const precoUnitario = Number(lote.valor_ingresso);
      const subtotal = precoUnitario * quantidade;
      valorTotal += subtotal;

      itensParaCriar.push({
        id_lote: idLote,
        quantidade,
        preco_unitario_momento: precoUnitario,
        subtotal,
        titulares: titularesValidos
      });

      itensParaPreferencia.push({
        title: lote.nome_lote || 'Ingresso Geektopia',
        unit_price: precoUnitario,
        quantity: quantidade,
        currency_id: 'BRL'
      });
    }

    const novoPedido = await prisma.pedido.create({
      data: {
        id_usuario,
        valor_total_bruto: valorTotal,
        status_pedido: 'Pendente',
        itens: { create: itensParaCriar },
        pagamento: {
          create: {
            valor_total: valorTotal,
            status_pagamento: 'Pendente'
          }
        }
      },
      include: { itens: true }
    });

    const webhookUrl = `${baseUrl()}/api/pedidos/webhook`;
    // As três telas de retorno vão direto para o front local. Sem
    // auto_return (ver comentário abaixo), o Mercado Pago aceita um back_url
    // sem HTTPS, então não depende do túnel do ngrok — só o webhook depende.
    const confirmacaoUrl = `${frontendUrl()}/pedido/${novoPedido.id_pedido}/confirmacao`;

    console.log(`📍 Webhook URL enviada ao Mercado Pago: ${webhookUrl}`);

    // Gera a preferência no Mercado Pago
    const inicioMP = Date.now();
    let result;
    try {
    const preference = new Preference(client);
    result = await preference.create({
      body: {
        items: itensParaPreferencia,
        external_reference: JSON.stringify({ id_pedido: novoPedido.id_pedido }),
        notification_url: webhookUrl,
        back_urls: {
          success: confirmacaoUrl,
          failure: confirmacaoUrl,
          pending: confirmacaoUrl
        }
        // Sem auto_return de propósito: essa opção do Mercado Pago exige
        // back_url em HTTPS, o que obrigaria a manter o ngrok no ar só para
        // isso. Sem ela, quem paga vê um botão "Voltar ao site" na tela do
        // Mercado Pago em vez de ser redirecionado sozinho — um clique a
        // mais, mas sem depender de mais nenhum serviço externo.
      }
    });
    console.log(`⏱️ Mercado Pago respondeu em ${Date.now() - inicioMP} ms (pedido ${novoPedido.id_pedido})`);
    } catch (erroMP) {
      console.error(`Mercado Pago falhou após ${Date.now() - inicioMP} ms:`, erroMP?.message || erroMP);
      // Nada foi cobrado: desfaz o pedido para não deixar "Pendente" órfão no histórico.
      await prisma.$transaction([
        prisma.pagamento.deleteMany({ where: { id_pedido: novoPedido.id_pedido } }),
        prisma.item_Pedido.deleteMany({ where: { id_pedido: novoPedido.id_pedido } }),
        prisma.pedido.delete({ where: { id_pedido: novoPedido.id_pedido } })
      ]).catch((e) => console.error('Não foi possível desfazer o pedido:', e.message));
      return res.status(502).json({ error: 'Não conseguimos abrir o pagamento no Mercado Pago agora. Nenhuma cobrança foi feita; tente novamente em instantes.' });
    }

    return res.status(201).json({
      mensagem: 'Pedido criado com sucesso!',
      id_pedido: novoPedido.id_pedido,
      init_point: result.init_point
    });

  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    return res.status(500).json({ error: 'Erro interno ao processar o pedido.' });
  }
};

// 2. RECEBER WEBHOOK E GERAR INGRESSOS
exports.receberWebhook = async (req, res) => {
  try {
    const type = req.body?.type || req.query?.topic;
    const paymentId = req.body?.data?.id || req.query?.id;

    // Assinatura do Mercado Pago (quando MP_WEBHOOK_SECRET está configurado): recusa quem não é o MP.
    const assinatura = validarAssinaturaWebhook(req);
    if (!assinatura.valida) {
      console.warn(`Webhook recusado: ${assinatura.motivo}`);
      return res.sendStatus(401);
    }

    if (type === 'payment' && paymentId) {
      // Nunca confiamos no corpo do webhook: o pagamento é sempre reconsultado no Mercado Pago.
      const payment = new Payment(client);
      const pagamentoInfo = await payment.get({ id: paymentId });

      const refExterna = JSON.parse(pagamentoInfo.external_reference || '{}');
      const idPedidoBanco = Number(refExterna.id_pedido);

      if (pagamentoInfo.status === 'approved' && idPedidoBanco) {
        await confirmarPagamentoAprovado(idPedidoBanco, pagamentoInfo);
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar Webhook:', error);
    return res.sendStatus(500); // o Mercado Pago tenta de novo
  }
};

// 3. LISTAR MEUS PEDIDOS
// GET /api/pedidos/meus - histórico de pedidos do usuário logado
exports.listarMeusPedidos = async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      where: { id_usuario: req.userId },
      orderBy: { data_pedido: 'desc' },
      include: {
        itens: { include: { lote: { select: { nome_lote: true } } } },
        pagamento: { select: { status_pagamento: true, metodo_pagamento: true, data_pagamento: true } }
      }
    });

    return res.json(pedidos.map(montarRespostaPedido));
  } catch (error) {
    console.error('Erro ao listar pedidos do usuário:', error);
    return res.status(500).json({ error: 'Erro ao listar os pedidos.' });
  }
};

// 4. BUSCAR PEDIDO POR ID
// GET /api/pedidos/:id - detalhe de um pedido (usado na tela de confirmação
// ao voltar do Mercado Pago). Só o dono do pedido ou um admin pode consultar.
exports.buscarPorId = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do pedido é inválido.' });
    }

    const pedido = await prisma.pedido.findUnique({
      where: { id_pedido: id },
      include: {
        itens: { include: { lote: { select: { nome_lote: true } } } },
        pagamento: true,
        // Pedido de ingresso tem itens; o de taxa de espaço ou de inscrição não.
        // Estas contagens dizem a que o pedido se refere.
        _count: { select: { solicitacoesEspaco: true, inscricoesCompeticao: true } }
      }
    });

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    if (pedido.id_usuario !== req.userId && !req.userIsAdmin) {
      return res.status(403).json({ error: 'Você não tem permissão para ver este pedido.' });
    }

    return res.json(montarRespostaPedido(pedido));
  } catch (error) {
    console.error('Erro ao buscar pedido:', error);
    return res.status(500).json({ error: 'Erro ao buscar o pedido.' });
  }
};

// 5. SINCRONIZAR PAGAMENTO
// GET /api/pedidos/:id/sincronizar - consulta a API do Mercado Pago
// diretamente e aplica o status mais recente, sem depender do webhook.
//
// Serve de rede de segurança: se por qualquer motivo (configuração de
// webhook, instabilidade do túnel, etc.) o Mercado Pago não avisar a gente
// sozinho, o próprio usuário consegue "puxar" o status pelo botão de
// atualizar da tela do pedido.
exports.sincronizarPagamento = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do pedido é inválido.' });
    }

    const pedido = await prisma.pedido.findUnique({ where: { id_pedido: id } });

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    if (pedido.id_usuario !== req.userId && !req.userIsAdmin) {
      return res.status(403).json({ error: 'Você não tem permissão para ver este pedido.' });
    }

    if (pedido.status_pedido === 'Pago') {
      return res.json({ status_pedido: 'Pago', mensagem: 'Este pedido já estava confirmado.' });
    }

    // O external_reference é o mesmo texto gravado na criação da preferência
    // (ver criarPedido), então a busca localiza o pagamento certo mesmo sem
    // sabermos o id dele.
    const payment = new Payment(client);
    const busca = await payment.search({
      options: {
        external_reference: JSON.stringify({ id_pedido: id }),
        sort: 'date_created',
        criteria: 'desc'
      }
    });

    // Se houve mais de uma tentativa, vale a aprovada; senão, a mais recente.
    const resultados = busca.results || [];
    const pagamentoInfo = resultados.find((p) => p.status === 'approved') || resultados[0];

    if (!pagamentoInfo) {
      return res.json({
        status_pedido: pedido.status_pedido,
        mensagem: 'O Mercado Pago ainda não registrou nenhum pagamento para este pedido.'
      });
    }

    if (pagamentoInfo.status === 'approved') {
      const r = await confirmarPagamentoAprovado(id, pagamentoInfo);
      if (r.ok) return res.json({ status_pedido: 'Pago', mensagem: r.jaConfirmado ? 'Este pedido já estava confirmado.' : 'Pagamento aprovado! Ingresso(s) gerado(s).' });
      return res.json({ status_pedido: pedido.status_pedido, mensagem: 'O pagamento foi aprovado, mas precisa de conferência da organização. Entre em contato com a CCPOP informando o número do pedido.' });
    }

    return res.json({
      status_pedido: pedido.status_pedido,
      mensagem: `O Mercado Pago reporta o status "${pagamentoInfo.status}" para este pagamento.`
    });
  } catch (error) {
    console.error('Erro ao sincronizar pagamento:', error);
    return res.status(500).json({ error: 'Erro interno ao consultar o status do pagamento.' });
  }
};
