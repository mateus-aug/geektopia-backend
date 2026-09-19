const express = require('express');
const router = express.Router();
const perfilParceiroController = require('../controllers/perfilParceiroController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// TODAS as rotas exigem login: perfil de parceiro é sempre de quem está
// autenticado. O controller lê o dono pelo req.userId do token.

// Rotas administrativas. Declaradas antes para deixar claro que '/admin/...'
// é caminho fixo.
router.get('/admin/expositores', authMiddleware, adminMiddleware, perfilParceiroController.listarExpositores);
router.patch('/admin/expositores/:id/status', authMiddleware, adminMiddleware, perfilParceiroController.alterarStatusExpositor);
router.get('/admin/competidores', authMiddleware, adminMiddleware, perfilParceiroController.listarCompetidores);

// Do próprio usuário.
router.get('/meu-perfil', authMiddleware, perfilParceiroController.meuPerfil);
router.post('/expositor', authMiddleware, perfilParceiroController.criarExpositor);
router.put('/expositor', authMiddleware, perfilParceiroController.atualizarExpositor);
router.post('/competidor', authMiddleware, perfilParceiroController.criarCompetidor);
router.put('/competidor', authMiddleware, perfilParceiroController.atualizarCompetidor);

module.exports = router;
