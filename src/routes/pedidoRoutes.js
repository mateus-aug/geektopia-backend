const express = require('express');
const router = express.Router();
const pedidoController = require('../controllers/pedidoController');

// Rota para criar o pedido e gerar link do Mercado Pago
router.post('/', pedidoController.criarPedido);

// Rota pública para receber os avisos automáticos do Mercado Pago
router.post('/webhook', pedidoController.receberWebhook);

module.exports = router;