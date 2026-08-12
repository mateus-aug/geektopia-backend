const express = require('express');
const router = express.Router();
const geektopiaController = require('../controllers/geektopiaController');
// A listagem de lotes fica sob este prefixo por ser rota aninhada
// (/api/geektopia/:id/lotes), mas a lógica pertence ao loteController.
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

// Rotas administrativas. Declaradas antes das que usam ':id' para deixar
// claro que '/admin/...' é caminho fixo, não um identificador.
router.get('/admin/todas', authMiddleware, exigirAdmin, geektopiaController.listarTodas);
router.get('/admin/:id', authMiddleware, exigirAdmin, geektopiaController.buscarPorId);
router.get('/admin/:id/lotes', authMiddleware, exigirAdmin, loteController.listarPorGeektopia);
router.post('/', authMiddleware, exigirAdmin, geektopiaController.criar);
router.put('/:id', authMiddleware, exigirAdmin, geektopiaController.atualizar);
router.patch('/:id/status', authMiddleware, exigirAdmin, geektopiaController.alterarStatus);
router.delete('/:id', authMiddleware, exigirAdmin, geektopiaController.remover);

// Rotas públicas: qualquer visitante acessa, sem token.
router.get('/', geektopiaController.listarPublicas);
router.get('/:id', geektopiaController.buscarPorId);
router.get('/:id/lotes', loteController.listarPorGeektopia);

module.exports = router;
