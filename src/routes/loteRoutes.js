const express = require('express');
const router = express.Router();
const loteController = require('../controllers/loteController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Rotas administrativas.
// A consulta existe separada da pública porque, passando pelo authMiddleware,
// o controller recebe req.userIsAdmin = true e passa a enxergar também os
// lotes de edições ainda bloqueadas.
router.get('/admin/:id', authMiddleware, adminMiddleware, loteController.buscarPorId);
router.post('/', authMiddleware, adminMiddleware, loteController.criar);
router.put('/:id', authMiddleware, adminMiddleware, loteController.atualizar);
router.delete('/:id', authMiddleware, adminMiddleware, loteController.remover);

// Rota pública: qualquer visitante acessa, sem token.
// A LISTAGEM de lotes não fica aqui - ela é aninhada à edição, em
// GET /api/geektopia/:id/lotes, porque um lote nunca é consultado fora do
// contexto do evento a que pertence.
router.get('/:id', loteController.buscarPorId);

module.exports = router;
