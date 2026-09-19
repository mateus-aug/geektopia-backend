const express = require('express');
const router = express.Router();
const espacoController = require('../controllers/espacoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Rotas administrativas.
router.post('/', authMiddleware, adminMiddleware, espacoController.criar);
router.put('/:id', authMiddleware, adminMiddleware, espacoController.atualizar);
router.delete('/:id', authMiddleware, adminMiddleware, espacoController.remover);

// Rotas públicas.
// Não há versão "admin" da consulta aqui: Espaco é um catálogo global, sem
// vínculo com edição, então não existe rascunho para esconder do público.
// O expositor precisa ver os preços antes de decidir se candidatar.
router.get('/', espacoController.listar);
router.get('/:id', espacoController.buscarPorId);

module.exports = router;
