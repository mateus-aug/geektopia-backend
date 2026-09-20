const express = require('express');
const router = express.Router();
const vitrineController = require('../controllers/vitrineController');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Só a diretoria escreve. A leitura pública fica em
// /api/geektopia/:id/convidados, junto da edição a que pertencem.
// '/reordenar' vem antes de '/:id' para não ser lido como identificador.
router.patch('/reordenar', authMiddleware, adminMiddleware, vitrineController.reordenarConvidados);
router.post('/', authMiddleware, adminMiddleware, uploadMiddleware.convidados.single('foto'), vitrineController.criarConvidado);
router.put('/:id', authMiddleware, adminMiddleware, uploadMiddleware.convidados.single('foto'), vitrineController.atualizarConvidado);
router.delete('/:id', authMiddleware, adminMiddleware, vitrineController.removerConvidado);

module.exports = router;
