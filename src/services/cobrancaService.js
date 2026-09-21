const { Preference } = require('mercadopago');
const prisma = require('../config/prisma');
const { client, baseUrl, frontendUrl } = require('./paymentService');

// Cobrança de itens que NÃO são ingresso (taxa de espaço do expositor, taxa de
// inscrição em competição): um Pedido por item cobrado, com a preferência de
// pagamento do Mercado Pago. Serve às duas telas para a regra ser uma só.
//
// - RETOMÁVEL: se já existe um pedido Pendente, reaproveita e gera um novo
//   link (a pessoa perdeu a aba do Mercado Pago). Pago/encerrado é recusado.
// - Duplo clique não cria dois pedidos: o vínculo com o item só é gravado se
//   ele ainda estiver sem pedido, dentro de uma transação.
// - Tem limite de tempo: o Mercado Pago lento não deixa a tela esperando para sempre.
const LIMITE_MP_MS = 20000;

function comLimite(promessa) {
  let temporizador;
  const estouro = new Promise((_, rejeitar) => {
    temporizador = setTimeout(() => rejeitar(new Error('MP_TEMPO_ESGOTADO')), LIMITE_MP_MS);
  });
  return Promise.race([promessa, estouro]).finally(() => clearTimeout(temporizador));
}

// @param {number}   idUsuario
// @param {number}   valor        maior que zero
// @param {string}   titulo       nome do item na tela do Mercado Pago
// @param {object|null} pedidoAtual  pedido já ligado ao item ({ id_pedido, status_pedido }) ou null
// @param {function} vincular     (tx, idPedido) => updateMany que liga o pedido ao item SÓ SE ainda sem pedido
// @returns {{ id_pedido, init_point, retomado } | { erro, status, id_pedido? }}
async function gerarOuRetomarCobranca({ idUsuario, valor, titulo, pedidoAtual, vincular }) {
  let pedido = pedidoAtual;

  if (pedido) {
    if (pedido.status_pedido === 'Pago') {
      return { status: 409, erro: 'Esta taxa já foi paga.', id_pedido: pedido.id_pedido };
    }
    if (pedido.status_pedido !== 'Pendente') {
      return { status: 409, erro: 'A cobrança anterior foi encerrada. Entre em contato com a organização.', id_pedido: pedido.id_pedido };
    }
  } else {
    pedido = await prisma.$transaction(async (tx) => {
      const criado = await tx.pedido.create({
        data: {
          id_usuario: idUsuario,
          valor_total_bruto: valor,
          status_pedido: 'Pendente',
          pagamento: { create: { valor_total: valor, status_pagamento: 'Pendente' } }
        }
      });
      const vinculo = await vincular(tx, criado.id_pedido);
      if (vinculo.count === 0) throw new Error('COBRANCA_JA_GERADA'); // desfaz o pedido recém-criado
      return criado;
    }).catch((e) => {
      if (e.message === 'COBRANCA_JA_GERADA') return null;
      throw e;
    });

    if (!pedido) return { status: 409, erro: 'Já existe uma cobrança em andamento. Atualize a página.' };
  }

  const confirmacaoUrl = `${frontendUrl()}/pedido/${pedido.id_pedido}/confirmacao`;

  try {
    const resultado = await comLimite(new Preference(client).create({
      body: {
        items: [{ title: titulo, unit_price: valor, quantity: 1, currency_id: 'BRL' }],
        external_reference: JSON.stringify({ id_pedido: pedido.id_pedido }),
        notification_url: `${baseUrl()}/api/pedidos/webhook`,
        back_urls: { success: confirmacaoUrl, failure: confirmacaoUrl, pending: confirmacaoUrl }
      }
    }));

    return { id_pedido: pedido.id_pedido, init_point: resultado.init_point, retomado: Boolean(pedidoAtual) };
  } catch (e) {
    if (e.message === 'MP_TEMPO_ESGOTADO') {
      // O pedido já existe (Pendente): tentar de novo retoma o mesmo, sem duplicar.
      return { status: 504, erro: 'O Mercado Pago demorou demais para responder. Tente de novo em instantes.', id_pedido: pedido.id_pedido };
    }
    throw e;
  }
}

module.exports = { gerarOuRetomarCobranca };
