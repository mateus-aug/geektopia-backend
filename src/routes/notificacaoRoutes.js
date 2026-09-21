const express = require('express');
const router = express.Router();
const notificacaoController = require('../controllers/notificacaoController');
const authMiddleware = require('../middlewares/authMiddleware');

// Sempre do usuário logado (o dono vem do token, nunca do corpo da requisição).
router.get('/', authMiddleware, notificacaoController.listar);
router.patch('/lidas', authMiddleware, notificacaoController.marcarTodasLidas);
router.patch('/:id/lida', authMiddleware, notificacaoController.marcarLida);

module.exports = router;
