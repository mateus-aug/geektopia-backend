const { Preference, Payment } = require('mercadopago');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { lerId } = require('../utils/validadores');
const { client, baseUrl, frontendUrl } = require('../services/paymentService');

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
        geektopia: { select: { status_evento: true } },
        _count: { select: { ingressos: true } }
      }
    });
    const lotesPorId = new Map(lotes.map((lote) => [lote.id_lote, lote]));

    let valorTotal = 0;
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

      const precoUnitario = Number(lote.valor_ingresso);
      const subtotal = precoUnitario * quantidade;
      valorTotal += subtotal;

      itensParaCriar.push({
        id_lote: idLote,
        quantidade,
        preco_unitario_momento: precoUnitario,
        subtotal
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
    // As três telas de retorno vão para a mesma página de confirmação do
    // front: ela mesma consulta o /sincronizar e mostra o status certo,
    // então não precisa de uma tela separada para cada caso.
    const confirmacaoUrl = `${frontendUrl()}/pedido/${novoPedido.id_pedido}/confirmacao`;

    console.log(`📍 Webhook URL enviada ao Mercado Pago: ${webhookUrl}`);

    // Gera a preferência no Mercado Pago
    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: itensParaPreferencia,
        external_reference: JSON.stringify({ id_pedido: novoPedido.id_pedido }),
        notification_url: webhookUrl,
        back_urls: {
          success: confirmacaoUrl,
          failure: confirmacaoUrl,
          pending: confirmacaoUrl
        },
        auto_return: 'approved'
      }
    });

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

// Traduz o método que o Mercado Pago informou para o enum do schema.
// `payment_method_id` identifica o Pix especificamente; os demais casos vêm
// em `payment_type_id`. Cai em null (em vez de adivinhar) quando o Mercado
// Pago manda um tipo que não mapeamos — errado seria gravar um valor chutado.
function mapearMetodoPagamento(pagamentoInfo) {
  if (pagamentoInfo.payment_method_id === 'pix') return 'Pix';

  switch (pagamentoInfo.payment_type_id) {
    case 'credit_card':
      return 'CartaoCredito';
    case 'debit_card':
      return 'CartaoDebito';
    case 'ticket':
      return 'Boleto';
    case 'account_money':
      return 'SaldoConta';
    default:
      return null;
  }
}

// Aplica os efeitos de um pagamento aprovado: marca o Pagamento/Pedido como
// Pago e gera os Ingressos. Compartilhado pelo webhook e pela sincronização
// manual (item 5) — os dois descobrem o mesmo jeito que um pagamento foi
// aprovado, só que por caminhos diferentes, e precisam do mesmo resultado.
//
// Idempotente: se o pedido já estava "Pago" (ex.: o webhook e a sincronização
// manual chegarem quase juntos), não gera ingresso duplicado.
async function aplicarPagamentoAprovado(idPedidoBanco, pagamentoInfo) {
  await prisma.pagamento.update({
    where: { id_pedido: idPedidoBanco },
    data: {
      status_pagamento: 'Aprovado',
      metodo_pagamento: mapearMetodoPagamento(pagamentoInfo),
      codigo_transacao: String(pagamentoInfo.id),
      data_pagamento: new Date()
    }
  });

  const pedidoExistente = await prisma.pedido.findUnique({
    where: { id_pedido: idPedidoBanco }
  });

  if (pedidoExistente.status_pedido === 'Pago') {
    console.log(`⚠️ Pedido #${idPedidoBanco} já estava Pago. Notificação duplicada ignorada.`);
    return;
  }

  const pedidoAtualizado = await prisma.pedido.update({
    where: { id_pedido: idPedidoBanco },
    data: { status_pedido: 'Pago' },
    include: { itens: true }
  });

  // GERAR OS INGRESSOS AUTOMATICAMENTE NA TABELA INGRESSO
  for (const item of pedidoAtualizado.itens) {
    if (item.id_lote) {
      // Busca o lote no banco para identificar o evento (id_geektopia) correto
      const loteDoBanco = await prisma.lote.findUnique({
        where: { id_lote: item.id_lote }
      });

      if (loteDoBanco) {
        for (let i = 0; i < item.quantidade; i++) {
          await prisma.ingresso.create({
            data: {
              id_usuario: pedidoAtualizado.id_usuario,
              id_geektopia: loteDoBanco.id_geektopia, // Usa o ID do evento atrelado ao Lote
              id_lote: item.id_lote,
              id_item: item.id_item,
              codigo_qr: `GT-${crypto.randomUUID()}`,
              status_ingresso: 'Valido'
            }
          });
        }
      }
    }
  }

  console.log(`✅ Pedido #${idPedidoBanco} PAGO e Ingressos gerados com sucesso!`);
}

// 2. RECEBER WEBHOOK E GERAR INGRESSOS
exports.receberWebhook = async (req, res) => {
    console.log('========== WEBHOOK RECEBIDO ==========');
    console.log('Headers:', req.headers);
    console.log('Query:', req.query);

    console.log('Body:', req.body);
  try {
    const type = req.body?.type || req.query?.topic;
    const paymentId = req.body?.data?.id || req.query?.id;

    if (type === 'payment' && paymentId) {
      const payment = new Payment(client);
      const pagamentoInfo = await payment.get({ id: paymentId });

      const statusMP = pagamentoInfo.status;
      const refExterna = JSON.parse(pagamentoInfo.external_reference || '{}');
      const idPedidoBanco = Number(refExterna.id_pedido);

      if (statusMP === 'approved' && idPedidoBanco) {
        await aplicarPagamentoAprovado(idPedidoBanco, pagamentoInfo);
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar Webhook:', error);
    return res.sendStatus(500);
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
        pagamento: true
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

    const pagamentoInfo = busca.results?.[0];

    if (!pagamentoInfo) {
      return res.json({
        status_pedido: pedido.status_pedido,
        mensagem: 'O Mercado Pago ainda não registrou nenhum pagamento para este pedido.'
      });
    }

    if (pagamentoInfo.status === 'approved') {
      await aplicarPagamentoAprovado(id, pagamentoInfo);
      return res.json({ status_pedido: 'Pago', mensagem: 'Pagamento aprovado! Ingresso(s) gerado(s).' });
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
