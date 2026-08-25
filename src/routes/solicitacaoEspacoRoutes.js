const express = require('express');
const router = express.Router();
const solicitacaoEspacoController = require('../controllers/solicitacaoEspacoController');
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

// TODAS as rotas exigem login. Não existe consulta pública aqui: candidatura
// de expositor contém valores e dados de contato, e só interessa a quem a fez
// e à diretoria.

// Fila de análise da diretoria. Declarada antes de '/:id' por ser caminho fixo.
router.get('/admin/todas', authMiddleware, exigirAdmin, solicitacaoEspacoController.listarTodas);
router.patch('/:id/status', authMiddleware, exigirAdmin, solicitacaoEspacoController.alterarStatus);

// Do expositor. O controller confere a posse pelo req.userId do token —
// nunca por um id vindo do corpo ou da URL.
router.post('/', authMiddleware, solicitacaoEspacoController.criar);
router.get('/minhas', authMiddleware, solicitacaoEspacoController.listarMinhas);
router.get('/:id', authMiddleware, solicitacaoEspacoController.buscarPorId);
router.put('/:id', authMiddleware, solicitacaoEspacoController.atualizar);
router.delete('/:id', authMiddleware, solicitacaoEspacoController.remover);

module.exports = router;
