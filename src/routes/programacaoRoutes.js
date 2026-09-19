const express = require('express');
const router = express.Router();
const programacaoController = require('../controllers/programacaoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Rotas administrativas.
// A consulta existe separada da pública porque, passando pelo authMiddleware,
// o controller recebe req.userIsAdmin = true e enxerga também as atividades
// de edições ainda bloqueadas.
router.get('/admin/:id', authMiddleware, adminMiddleware, programacaoController.buscarPorId);
router.post('/', authMiddleware, adminMiddleware, programacaoController.criar);
router.put('/:id', authMiddleware, adminMiddleware, programacaoController.atualizar);
router.delete('/:id', authMiddleware, adminMiddleware, programacaoController.remover);

// Rota pública: qualquer visitante acessa, sem token.
// A GRADE completa não fica aqui - ela é aninhada à edição, em
// GET /api/geektopia/:id/programacao.
router.get('/:id', programacaoController.buscarPorId);

module.exports = router;
