const express = require('express');
const router = express.Router();
const conteudoController = require('../controllers/conteudoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Público: a landing page lê o conteúdo daqui.
router.get('/landing', conteudoController.buscarLanding);

// Administrativas.
router.put('/landing', authMiddleware, adminMiddleware, conteudoController.salvarLanding);
router.delete('/landing', authMiddleware, adminMiddleware, conteudoController.restaurarLanding);
router.get('/geektopia', conteudoController.buscarGeektopia);
router.put('/geektopia', authMiddleware, adminMiddleware, conteudoController.salvarGeektopia);
router.delete('/geektopia', authMiddleware, adminMiddleware, conteudoController.restaurarGeektopia);
router.get('/sugestoes', authMiddleware, adminMiddleware, conteudoController.sugestoes);

module.exports = router;
