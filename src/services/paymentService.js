const { MercadoPagoConfig } = require('mercadopago');

// Cliente único do Mercado Pago, compartilhado por quem precisa gerar uma
// cobrança (pedidoController para ingressos, solicitacaoEspacoController
// para a taxa de expositor). Evita reconfigurar o SDK com o mesmo token em
// cada arquivo que precisar cobrar algo.
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  // Sem isto, o SDK usa um limite padrão curto e, em rede lenta, a compra parece
  // "travar" sem mensagem. 15 s é folga de sobra para uma chamada normal.
  options: { timeout: 15000 }
});

// URL pública do backend (hoje o túnel do ngrok), usada para o Mercado Pago
// (o servidor dele) chamar o webhook. Precisa ser alcançável de fora.
function baseUrl() {
  return (process.env.URL_WEBHOOK || '').trim().replace(/\/$/, '');
}

// URL do front-end, usada só nos back_urls (a tela pra onde o comprador
// volta depois de pagar). Quem abre esse link é o navegador de quem está
// comprando, não o servidor do Mercado Pago — por isso não precisa do túnel,
// o endereço local do Vite já resolve.
function frontendUrl() {
  return (process.env.URL_FRONTEND || '').trim().replace(/\/$/, '');
}

module.exports = { client, baseUrl, frontendUrl };
