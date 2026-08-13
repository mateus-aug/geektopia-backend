const express = require('express');
const router = express.Router();
const competicaoController = require('../controllers/competicaoController');
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
// o controller recebe req.userIsAdmin = true e enxerga também as competições
// de edições ainda bloqueadas.
router.get('/admin/:id', authMiddleware, exigirAdmin, competicaoController.buscarPorId);
router.post('/', authMiddleware, exigirAdmin, competicaoController.criar);
router.put('/:id', authMiddleware, exigirAdmin, competicaoController.atualizar);
router.delete('/:id', authMiddleware, exigirAdmin, competicaoController.remover);

// Rota pública: qualquer visitante acessa, sem token.
// A LISTA de competições de um evento fica aninhada à edição, em
// GET /api/geektopia/:id/competicoes.
router.get('/:id', competicaoController.buscarPorId);

module.exports = router;
