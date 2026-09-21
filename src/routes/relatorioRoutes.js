const express = require('express');
const router = express.Router();
const relatorioController = require('../controllers/relatorioController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

router.get('/painel', authMiddleware, adminMiddleware, relatorioController.painel);

module.exports = router;
