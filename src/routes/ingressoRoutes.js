const express = require('express');
const router = express.Router();
const ingressoController = require('../controllers/ingressoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// TODAS as rotas exigem login. O controller lê o dono pelo req.userId do token.

// Portaria (admin). Declarada antes de '/:id' por ser caminho fixo.
router.patch('/checkin', authMiddleware, adminMiddleware, ingressoController.checkin);

// Do participante.
router.get('/meus', authMiddleware, ingressoController.listarMeus);
router.get('/:id', authMiddleware, ingressoController.buscarPorId);

module.exports = router;
