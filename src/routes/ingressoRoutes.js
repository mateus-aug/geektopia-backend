const express = require('express');
const router = express.Router();
const ingressoController = require('../controllers/ingressoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// "/meus" fica antes de "/:id" para não ser interpretada como um id de ingresso.
router.get('/meus', authMiddleware, ingressoController.listarMeus);

// Check-in na portaria do evento: só administradores podem validar entrada.
router.post('/checkin', authMiddleware, adminMiddleware, ingressoController.registrarCheckin);

router.get('/:id', authMiddleware, ingressoController.buscarPorId);

module.exports = router;
