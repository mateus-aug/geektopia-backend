const crypto = require('crypto');

// Confere a assinatura que o Mercado Pago coloca nos webhooks (cabeçalho x-signature):
//   x-signature: ts=<timestamp>,v1=<hmac sha256 em hex>
// O "manifesto" assinado é  id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// Só é exigida quando MP_WEBHOOK_SECRET está definido (a chave fica no painel do Mercado Pago).
// Sem a chave, o webhook segue funcionando (o pagamento é reconsultado no MP de qualquer forma),
// mas a assinatura é a segunda trava recomendada para produção.
function validarAssinaturaWebhook(req) {
  const segredo = process.env.MP_WEBHOOK_SECRET;
  if (!segredo) return { valida: true, verificada: false };

  const cabecalho = String(req.headers['x-signature'] || '');
  const partes = Object.fromEntries(cabecalho.split(',').map((p) => p.trim().split('=')).filter((p) => p.length === 2));
  if (!partes.ts || !partes.v1) return { valida: false, motivo: 'sem assinatura' };

  const idDados = String(req.body?.data?.id || req.query?.['data.id'] || req.query?.id || '').toLowerCase();
  const manifesto = `id:${idDados};request-id:${req.headers['x-request-id'] || ''};ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');

  const a = Buffer.from(esperado);
  const b = Buffer.from(String(partes.v1));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { valida: false, motivo: 'assinatura inválida' };
  return { valida: true, verificada: true };
}

module.exports = { validarAssinaturaWebhook };
