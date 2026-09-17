const express = require('express');
const router = express.Router();
const competicaoController = require('../controllers/competicaoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Rotas administrativas.
// A consulta existe separada da pública porque, passando pelo authMiddleware,
// o controller recebe req.userIsAdmin = true e enxerga também as competições
// de edições ainda bloqueadas.
router.get('/admin/:id', authMiddleware, adminMiddleware, competicaoController.buscarPorId);
router.post('/', authMiddleware, adminMiddleware, competicaoController.criar);
router.put('/:id', authMiddleware, adminMiddleware, competicaoController.atualizar);
router.delete('/:id', authMiddleware, adminMiddleware, competicaoController.remover);

// Rota pública: qualquer visitante acessa, sem token.
// A LISTA de competições de um evento fica aninhada à edição, em
// GET /api/geektopia/:id/competicoes.
router.get('/:id', competicaoController.buscarPorId);

module.exports = router;
