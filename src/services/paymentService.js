const { MercadoPagoConfig } = require('mercadopago');

// Cliente único do Mercado Pago, compartilhado por quem precisa gerar uma
// cobrança (pedidoController para ingressos, solicitacaoEspacoController
// para a taxa de expositor). Evita reconfigurar o SDK com o mesmo token em
// cada arquivo que precisar cobrar algo.
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
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

// URL de back_url para um pedido específico: aponta para a "ponte" do
// próprio backend (HTTPS via ngrok), não direto para o front.
//
// O Mercado Pago só redireciona sozinho (auto_return) quando o back_url é
// HTTPS, e o front em desenvolvimento roda em localhost puro (sem HTTPS).
// A ponte (GET /api/pedidos/:id/voltar) resolve isso: o navegador de quem
// comprou passa por essa URL pública primeiro, e de lá é reencaminhado pro
// endereço local da tela de confirmação — sem precisar de um segundo túnel
// do ngrok só para o front.
function backUrlDoPedido(idPedido) {
  return `${baseUrl()}/api/pedidos/${idPedido}/voltar`;
}

module.exports = { client, baseUrl, frontendUrl, backUrlDoPedido };
