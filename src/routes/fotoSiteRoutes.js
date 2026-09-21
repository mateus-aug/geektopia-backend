const express = require('express');
const router = express.Router();
const c = require('../controllers/fotoSiteController');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

router.get('/', c.listar);
router.patch('/reordenar', authMiddleware, adminMiddleware, c.reordenar);
router.post('/', authMiddleware, adminMiddleware, uploadMiddleware.galeria.single('foto'), c.criar);
router.put('/:id', authMiddleware, adminMiddleware, c.atualizar);
router.delete('/:id', authMiddleware, adminMiddleware, c.remover);

module.exports = router;
