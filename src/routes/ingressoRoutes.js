const express = require('express');
const router = express.Router();
const ingressoController = require('../controllers/ingressoController');
const authMiddleware = require('../middlewares/authMiddleware');

// TODAS as rotas exigem login. O controller lê o dono pelo req.userId do token.

// '/meus' antes de '/:id' por ser caminho fixo.
router.get('/meus', authMiddleware, ingressoController.listarMeus);
router.get('/:id', authMiddleware, ingressoController.buscarPorId);

module.exports = router;
