const crypto = require('crypto');
const prisma = require('../config/prisma');
const { idadeExigida } = require('../utils/titulares');
const { notificar, notificarAdmins } = require('./notificacoes');

// CONFIRMAÇÃO DE PAGAMENTO — o ponto mais sensível do sistema (dinheiro entrando).
// Regras, todas cobertas por testes (tests/pagamento.test.js):
//   1. Só confirma se o Mercado Pago diz "approved" E o VALOR pago é exatamente o valor do pedido.
//   2. Tudo acontece numa TRANSAÇÃO: ou o pedido vira Pago e TODOS os ingressos nascem, ou nada muda.
//   3. IDEMPOTENTE e à prova de corrida: webhook duplicado, webhook + sincronização ao mesmo tempo
//      e reenvios do Mercado Pago confirmam uma vez só (a virada Pendente -> Pago é um UPDATE condicional).
//   4. O estoque do lote é conferido de novo, com o lote TRAVADO, na hora de emitir (duas compras
//      simultâneas não vendem o mesmo ingresso duas vezes).
//   5. Divergência (valor, estoque, pedido cancelado) NÃO emite nada e é registrada com o prefixo
//      ALERTA-FINANCEIRO, para revisão manual.

const centavos = (v) => Math.round(Number(v) * 100);

// Traduz o método que o Mercado Pago informou para o enum do schema.
// Cai em null (em vez de adivinhar) quando o tipo não é mapeado.
function mapearMetodoPagamento(info) {
  if (info.payment_method_id === 'pix') return 'Pix';
  switch (info.payment_type_id) {
    case 'credit_card': return 'CartaoCredito';
    case 'debit_card': return 'CartaoDebito';
    case 'ticket': return 'Boleto';
    case 'account_money': return 'SaldoConta';
    default: return null;
  }
}

// Divergência financeira: vai para o log E avisa os administradores no site (nunca fica só no terminal).
function alerta(texto, extra) {
  console.error(`ALERTA-FINANCEIRO: ${texto}`, extra || '');
  notificarAdmins({ tipo: 'alerta_financeiro', titulo: 'Atenção: pagamento precisa de conferência', texto, link: '/admin' });
}

// @returns {{ ok: boolean, jaConfirmado?: boolean, motivo?: string }}
async function confirmarPagamentoAprovado(idPedido, info) {
  if (!info || info.status !== 'approved') return { ok: false, motivo: 'PAGAMENTO_NAO_APROVADO' };

  const pedido = await prisma.pedido.findUnique({ where: { id_pedido: idPedido }, include: { itens: true } });
  if (!pedido) return { ok: false, motivo: 'PEDIDO_INEXISTENTE' };
  if (pedido.status_pedido === 'Pago') return { ok: true, jaConfirmado: true };

  if (pedido.status_pedido !== 'Pendente') {
    alerta(`pagamento aprovado (MP ${info.id}) para o pedido #${idPedido}, que está "${pedido.status_pedido}". Nada foi emitido.`);
    return { ok: false, motivo: `PEDIDO_${String(pedido.status_pedido).toUpperCase()}` };
  }

  if (info.currency_id && info.currency_id !== 'BRL') {
    alerta(`moeda inesperada (${info.currency_id}) no pedido #${idPedido}.`);
    return { ok: false, motivo: 'MOEDA_DIVERGENTE' };
  }
  if (centavos(info.transaction_amount) !== centavos(pedido.valor_total_bruto)) {
    alerta(`valor divergente no pedido #${idPedido}: esperado ${pedido.valor_total_bruto}, pago ${info.transaction_amount} (MP ${info.id}). Nada foi emitido.`);
    return { ok: false, motivo: 'VALOR_DIVERGENTE' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Virada condicional: só UM chamador consegue passar de Pendente para Pago.
      const virou = await tx.pedido.updateMany({ where: { id_pedido: idPedido, status_pedido: 'Pendente' }, data: { status_pedido: 'Pago' } });
      if (virou.count === 0) throw Object.assign(new Error('JA_CONFIRMADO'), { codigo: 'JA_CONFIRMADO' });

      await tx.pagamento.update({
        where: { id_pedido: idPedido },
        data: {
          status_pagamento: 'Aprovado',
          metodo_pagamento: mapearMetodoPagamento(info),
          codigo_transacao: String(info.id),
          data_pagamento: new Date()
        }
      });

      for (const item of pedido.itens) {
        if (!item.id_lote) continue;

        // Trava a linha do lote até o fim da transação: quem chega junto espera a sua vez.
        await tx.$queryRaw`SELECT id_lote FROM "Lote" WHERE id_lote = ${item.id_lote} FOR UPDATE`;
        const lote = await tx.lote.findUnique({ where: { id_lote: item.id_lote }, include: { geektopia: { select: { classificacao_etaria: true } } } });
        if (!lote) continue;

        if (lote.quantidade_total !== null) {
          const emitidos = await tx.ingresso.count({ where: { id_lote: lote.id_lote, status_ingresso: { not: 'Cancelado' } } });
          if (emitidos + item.quantidade > lote.quantidade_total) {
            throw Object.assign(new Error('ESTOQUE_ESGOTADO'), { codigo: 'ESTOQUE_ESGOTADO' });
          }
        }

        const titulares = Array.isArray(item.titulares) ? item.titulares : [];
        const idadeMinima = idadeExigida(lote, lote.geektopia); // congelada na emissão

        for (let i = 0; i < item.quantidade; i += 1) {
          const t = titulares[i];
          await tx.ingresso.create({
            data: {
              id_usuario: pedido.id_usuario,
              id_geektopia: lote.id_geektopia,
              id_lote: lote.id_lote,
              id_item: item.id_item,
              codigo_qr: `GT-${crypto.randomUUID()}`,
              status_ingresso: 'Valido',
              ...(t && {
                nome_titular: t.nome_completo,
                documento_titular: t.documento,
                data_nascimento_titular: new Date(`${t.data_nascimento}T00:00:00Z`)
              }),
              idade_minima: idadeMinima
            }
          });
        }
      }
    }, { timeout: 20000, maxWait: 10000 });
  } catch (erro) {
    if (erro.codigo === 'JA_CONFIRMADO') return { ok: true, jaConfirmado: true };
    if (erro.codigo === 'ESTOQUE_ESGOTADO') {
      alerta(`pagamento aprovado (MP ${info.id}) mas o estoque acabou antes de emitir o pedido #${idPedido}. REEMBOLSO NECESSÁRIO.`);
      return { ok: false, motivo: 'ESTOQUE_ESGOTADO' };
    }
    throw erro;
  }

  console.log(`✅ Pedido #${idPedido} PAGO e ingressos emitidos.`);
  avisarComprador(pedido);
  return { ok: true };
}

// Diz ao comprador o que o pagamento confirmou (ingressos, taxa de espaço ou inscrição).
async function avisarComprador(pedido) {
  try {
    const [sol, insc] = await Promise.all([
      prisma.solicitacao_Espaco.findFirst({ where: { id_pedido: pedido.id_pedido }, select: { id_solicitacao: true } }),
      prisma.inscricao_Competicao.findFirst({ where: { id_pedido: pedido.id_pedido }, select: { id_inscricao: true } })
    ]);
    if (sol) {
      await notificar(pedido.id_usuario, { tipo: 'pagamento_confirmado', titulo: 'Pagamento confirmado', texto: 'A taxa do seu espaço foi paga. Sua presença na edição está garantida.', link: `/expositor/solicitacoes/${sol.id_solicitacao}` });
    } else if (insc) {
      await notificar(pedido.id_usuario, { tipo: 'pagamento_confirmado', titulo: 'Pagamento confirmado', texto: 'A taxa da sua inscrição foi paga. Sua vaga está garantida.', link: '/competidor' });
    } else {
      await notificar(pedido.id_usuario, { tipo: 'ingresso_emitido', titulo: 'Seus ingressos estão prontos!', texto: 'O pagamento foi confirmado. Baixe os ingressos em PDF e guarde no celular: na entrada, basta mostrar o QR code e um documento com foto.', link: '/perfil' });
    }
  } catch (erro) {
    console.error('Falha ao avisar o comprador:', erro.message);
  }
}

module.exports = { confirmarPagamentoAprovado, mapearMetodoPagamento, centavos };
