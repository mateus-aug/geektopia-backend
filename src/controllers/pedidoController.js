const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const crypto = require('crypto');
const prisma = require('../config/prisma');

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN 
});

// 1. CRIAR PEDIDO
exports.criarPedido = async (req, res) => {
  try {
    const id_usuario = req.usuarioId || req.body.id_usuario;
    const { itens, id_geektopia } = req.body; 

    if (!id_usuario || !itens || itens.length === 0) {
      return res.status(400).json({ error: 'Usuário, evento e itens são obrigatórios.' });
    }

    const valorTotal = itens.reduce((acc, item) => acc + (Number(item.preco_unitario) * Number(item.quantidade)), 0);

    const novoPedido = await prisma.pedido.create({
      data: {
        id_usuario: Number(id_usuario),
        valor_total_bruto: valorTotal,
        status_pedido: 'Pendente',
        itens: {
          create: itens.map(item => ({
            id_lote: item.id_lote ? Number(item.id_lote) : null,
            quantidade: Number(item.quantidade),
            preco_unitario_momento: item.preco_unitario,
            subtotal: Number(item.preco_unitario) * Number(item.quantidade),
          }))
        },
        pagamento: {
          create: {
            valor_total: valorTotal,
            status_pagamento: 'Pendente'
          }
        }
      },
      include: { itens: true }
    });

    // Trata a URL do .env para remover barras extras no final e evitar erros de rota
    const baseUrl = (process.env.URL_WEBHOOK || '').trim().replace(/\/$/, '');
    const webhookUrl = `${baseUrl}/api/pedidos/webhook`;

    console.log(`📍 Webhook URL enviada ao Mercado Pago: ${webhookUrl}`);

    // Gera a preferência no Mercado Pago
const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: itens.map(item => ({
          title: item.titulo || 'Ingresso Geektopia',
          unit_price: Number(item.preco_unitario),
          quantity: Number(item.quantidade),
          currency_id: 'BRL',
        })),
        external_reference: JSON.stringify({
          id_pedido: novoPedido.id_pedido,
          id_geektopia: id_geektopia || 7 
        }),
        notification_url: webhookUrl,
        back_urls: {
          success: `${baseUrl}/api/pedidos/sucesso`,
          failure: `${baseUrl}/api/pedidos/falha`,
          pending: `${baseUrl}/api/pedidos/pendente`
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
        // Atualiza Pagamento e Pedido
        await prisma.pagamento.update({
          where: { id_pedido: idPedidoBanco },
          data: {
            status_pagamento: 'Aprovado',
            codigo_transacao: String(pagamentoInfo.id),
            data_pagamento: new Date(),
          }
        });
        const pedidoExistente = await prisma.pedido.findUnique({
          where: { id_pedido: idPedidoBanco }
        });

        if (pedidoExistente.status_pedido === 'Pago') {
          console.log(`⚠️ Pedido #${idPedidoBanco} já estava Pago. Notificação duplicada ignorada.`);
          return res.sendStatus(200);
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
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar Webhook:', error);
    return res.sendStatus(500);
  }
};