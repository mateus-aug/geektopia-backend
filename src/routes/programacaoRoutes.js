const express = require('express');
const router = express.Router();
const programacaoController = require('../controllers/programacaoController');
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
// o controller recebe req.userIsAdmin = true e enxerga também as atividades
// de edições ainda bloqueadas.
router.get('/admin/:id', authMiddleware, exigirAdmin, programacaoController.buscarPorId);
router.post('/', authMiddleware, exigirAdmin, programacaoController.criar);
router.put('/:id', authMiddleware, exigirAdmin, programacaoController.atualizar);
router.delete('/:id', authMiddleware, exigirAdmin, programacaoController.remover);

// Rota pública: qualquer visitante acessa, sem token.
// A GRADE completa não fica aqui - ela é aninhada à edição, em
// GET /api/geektopia/:id/programacao.
router.get('/:id', programacaoController.buscarPorId);

module.exports = router;
