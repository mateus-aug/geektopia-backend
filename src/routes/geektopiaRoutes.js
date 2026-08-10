const express = require('express');
const router = express.Router();
const geektopiaController = require('../controllers/geektopiaController');
const authMiddleware = require('../middlewares/authMiddleware');
const exigirAdmin = require('../middlewares/exigirAdmin');

// Rotas administrativas. Declaradas antes das que usam ':id' para deixar
// claro que '/admin/...' é caminho fixo, não um identificador.
router.get('/admin/todas', authMiddleware, exigirAdmin, geektopiaController.listarTodas);
router.get('/admin/:id', authMiddleware, exigirAdmin, geektopiaController.buscarPorId);
router.post('/', authMiddleware, exigirAdmin, geektopiaController.criar);
router.put('/:id', authMiddleware, exigirAdmin, geektopiaController.atualizar);
router.patch('/:id/status', authMiddleware, exigirAdmin, geektopiaController.alterarStatus);
router.delete('/:id', authMiddleware, exigirAdmin, geektopiaController.remover);

// Rotas públicas: qualquer visitante acessa, sem token.
router.get('/', geektopiaController.listarPublicas);
router.get('/:id', geektopiaController.buscarPorId);

module.exports = router;
