const { MercadoPagoConfig } = require('mercadopago');

// Cliente único do Mercado Pago, compartilhado por quem precisa gerar uma
// cobrança (pedidoController para ingressos, solicitacaoEspacoController
// para a taxa de expositor). Evita reconfigurar o SDK com o mesmo token em
// cada arquivo que precisar cobrar algo.
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

// URL pública do backend (hoje o túnel do ngrok), usada tanto para receber o
// webhook quanto para os back_urls de retorno do checkout. Fica aqui porque
// as duas pontas do pagamento (criar cobrança e confirmar) precisam do mesmo
// valor, já limpo de barra extra no final.
function baseUrl() {
  return (process.env.URL_WEBHOOK || '').trim().replace(/\/$/, '');
}

module.exports = { client, baseUrl };
