const express = require('express');
const router = express.Router();
const institucionalController = require('../controllers/institucionalController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// ---- História institucional ----
// Leitura pública: é o conteúdo da landing page.
router.get('/historia', institucionalController.listarHistoria);
router.get('/historia/:id', institucionalController.buscarHistoria);
router.post('/historia', authMiddleware, adminMiddleware, institucionalController.criarHistoria);
router.put('/historia/:id', authMiddleware, adminMiddleware, institucionalController.atualizarHistoria);
router.delete('/historia/:id', authMiddleware, adminMiddleware, institucionalController.removerHistoria);

// ---- Galeria de edições passadas ----
router.get('/galeria', institucionalController.listarGaleria);
router.get('/galeria/:id', institucionalController.buscarGaleria);
router.post('/galeria', authMiddleware, adminMiddleware, institucionalController.criarGaleria);
router.put('/galeria/:id', authMiddleware, adminMiddleware, institucionalController.atualizarGaleria);
router.delete('/galeria/:id', authMiddleware, adminMiddleware, institucionalController.removerGaleria);

module.exports = router;
