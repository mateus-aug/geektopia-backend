const express = require('express');
const router = express.Router();
const loteController = require('../controllers/loteController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Admin.
router.get('/admin/:id', authMiddleware, adminMiddleware, loteController.buscarPorId);
router.post('/', authMiddleware, adminMiddleware, loteController.criar);
router.put('/:id', authMiddleware, adminMiddleware, loteController.atualizar);
router.delete('/:id', authMiddleware, adminMiddleware, loteController.remover);

// Público. A lista fica em GET /api/geektopia/:id/lotes.
router.get('/:id', loteController.buscarPorId);

module.exports = router;
