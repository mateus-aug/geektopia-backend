const express = require('express');
const router = express.Router();
const espacoController = require('../controllers/espacoController');
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
router.post('/', authMiddleware, exigirAdmin, espacoController.criar);
router.put('/:id', authMiddleware, exigirAdmin, espacoController.atualizar);
router.delete('/:id', authMiddleware, exigirAdmin, espacoController.remover);

// Rotas públicas.
// Não há versão "admin" da consulta aqui: Espaco é um catálogo global, sem
// vínculo com edição, então não existe rascunho para esconder do público.
// O expositor precisa ver os preços antes de decidir se candidatar.
router.get('/', espacoController.listar);
router.get('/:id', espacoController.buscarPorId);

module.exports = router;
