const express = require('express');
const router = express.Router();
const vitrineController = require('../controllers/vitrineController');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Só a diretoria escreve. A leitura pública fica em /api/geektopia/:id/fotos.
router.patch('/reordenar', authMiddleware, adminMiddleware, vitrineController.reordenarFotos);
router.post('/', authMiddleware, adminMiddleware, uploadMiddleware.galeria.single('foto'), vitrineController.criarFoto);
router.put('/:id', authMiddleware, adminMiddleware, vitrineController.atualizarFoto);
router.delete('/:id', authMiddleware, adminMiddleware, vitrineController.removerFoto);

module.exports = router;
