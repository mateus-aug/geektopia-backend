const express = require('express');
const router = express.Router();
const espacoController = require('../controllers/espacoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Rotas administrativas.
router.post('/copiar', authMiddleware, adminMiddleware, espacoController.copiar);
router.post('/', authMiddleware, adminMiddleware, espacoController.criar);
router.put('/:id', authMiddleware, adminMiddleware, espacoController.atualizar);
router.delete('/:id', authMiddleware, adminMiddleware, espacoController.remover);

// Rotas públicas.
// O expositor precisa ver os preços antes de decidir se candidatar. Cada espaço
// pertence a uma edição: use GET /espacos?id_geektopia=ID.
router.get('/', espacoController.listar);
router.get('/:id', espacoController.buscarPorId);

module.exports = router;
