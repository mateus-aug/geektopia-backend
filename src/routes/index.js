const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const geektopiaRoutes = require('./geektopiaRoutes');
const loteRoutes = require('./loteRoutes');
const programacaoRoutes = require('./programacaoRoutes');
const competicaoRoutes = require('./competicaoRoutes');
const espacoRoutes = require('./espacoRoutes');
const solicitacaoEspacoRoutes = require('./solicitacaoEspacoRoutes');
const institucionalRoutes = require('./institucionalRoutes');
const pedidoRoutes = require('./pedidoRoutes'); // <-- 1. Importa as rotas de pedido (Mateus)

// Agrupa todas as rotas sob o prefixo correto
router.use('/auth', authRoutes);
router.use('/geektopia', geektopiaRoutes);
router.use('/lotes', loteRoutes);
router.use('/programacao', programacaoRoutes);
router.use('/competicoes', competicaoRoutes);
router.use('/espacos', espacoRoutes);
router.use('/solicitacoes-espaco', solicitacaoEspacoRoutes);
router.use('/institucional', institucionalRoutes);
router.use('/pedidos', pedidoRoutes); // <-- 2. Conecta no caminho /api/pedidos (Mateus)

module.exports = router;
