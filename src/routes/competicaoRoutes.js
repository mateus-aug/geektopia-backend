const express = require('express');
const router = express.Router();
const competicaoController = require('../controllers/competicaoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Admin.
router.get('/admin/:id', authMiddleware, adminMiddleware, competicaoController.buscarPorId);
router.post('/', authMiddleware, adminMiddleware, competicaoController.criar);
router.put('/:id', authMiddleware, adminMiddleware, competicaoController.atualizar);
router.delete('/:id', authMiddleware, adminMiddleware, competicaoController.remover);

// Público. A lista fica em GET /api/geektopia/:id/competicoes.
router.get('/:id', competicaoController.buscarPorId);

module.exports = router;
