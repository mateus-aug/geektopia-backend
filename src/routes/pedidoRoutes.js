const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');
const authMiddleware = require('../middlewares/authMiddleware');

// Rota para criar o pedido e gerar link do Mercado Pago (exige login: o
// id_usuario vem sempre do token, nunca do corpo da requisição)
router.post('/', authMiddleware, pedidoController.criarPedido);

// Histórico de pedidos do usuário logado. Fica antes de "/:id" para não ser
// interpretada como um id de pedido.
router.get('/meus', authMiddleware, pedidoController.listarMeusPedidos);

// Detalhe de um pedido específico
router.get('/:id', authMiddleware, pedidoController.buscarPorId);

// Consulta o status do pagamento direto na API do Mercado Pago (rede de
// segurança caso o webhook não chegue)
router.get('/:id/sincronizar', authMiddleware, pedidoController.sincronizarPagamento);

// Rota pública para receber os avisos automáticos do Mercado Pago
router.post('/webhook', pedidoController.receberWebhook);

// Ponte pública usada como back_url do Mercado Pago (ver paymentService.js)
router.get('/:id/voltar', pedidoController.voltarParaFrontend);

module.exports = router;
