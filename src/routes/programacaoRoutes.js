const express = require('express');
const router = express.Router();
const programacaoController = require('../controllers/programacaoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Admin.
router.get('/admin/:id', authMiddleware, adminMiddleware, programacaoController.buscarPorId);
router.post('/', authMiddleware, adminMiddleware, programacaoController.criar);
router.put('/:id', authMiddleware, adminMiddleware, programacaoController.atualizar);
router.delete('/:id', authMiddleware, adminMiddleware, programacaoController.remover);

// Público. A grade fica em GET /api/geektopia/:id/programacao.
router.get('/:id', programacaoController.buscarPorId);

module.exports = router;
