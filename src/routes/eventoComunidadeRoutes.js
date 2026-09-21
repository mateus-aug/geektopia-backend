const express = require('express');
const router = express.Router();
const c = require('../controllers/eventoComunidadeController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Público
router.get('/', c.listarPublicos);

// Administração (caminhos fixos antes de /:id)
router.get('/admin/todos', authMiddleware, adminMiddleware, c.listarTodos);
router.patch('/admin/:id/status', authMiddleware, adminMiddleware, c.alterarStatus);
router.patch('/admin/:id/publicar', authMiddleware, adminMiddleware, c.publicar);

// Do próprio organizador
router.get('/meus', authMiddleware, c.listarMeus);
router.post('/', authMiddleware, c.enviar);
router.put('/:id', authMiddleware, c.editar);
router.delete('/:id', authMiddleware, c.remover);

module.exports = router;
