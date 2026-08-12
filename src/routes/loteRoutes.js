const express = require('express');
const router = express.Router();
const loteController = require('../controllers/loteController');
const authMiddleware = require('../middlewares/authMiddleware');

// Guard provisório: barra quem não é administrador.
// Roda sempre DEPOIS do authMiddleware, que é quem preenche req.userIsAdmin.
function exigirAdmin(req, res, next) {
  // 403 e não 401: a pessoa está autenticada, só não tem permissão.
  if (req.userIsAdmin !== true) {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }

  return next();
}

// Rotas administrativas.
// A consulta existe separada da pública porque, passando pelo authMiddleware,
// o controller recebe req.userIsAdmin = true e passa a enxergar também os
// lotes de edições ainda bloqueadas.
router.get('/admin/:id', authMiddleware, exigirAdmin, loteController.buscarPorId);
router.post('/', authMiddleware, exigirAdmin, loteController.criar);
router.put('/:id', authMiddleware, exigirAdmin, loteController.atualizar);
router.delete('/:id', authMiddleware, exigirAdmin, loteController.remover);

// Rota pública: qualquer visitante acessa, sem token.
// A LISTAGEM de lotes não fica aqui - ela é aninhada à edição, em
// GET /api/geektopia/:id/lotes, porque um lote nunca é consultado fora do
// contexto do evento a que pertence.
router.get('/:id', loteController.buscarPorId);

module.exports = router;
