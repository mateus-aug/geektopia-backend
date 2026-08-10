const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const geektopiaRoutes = require('./geektopiaRoutes');

// Agrupa todas as rotas sob o prefixo correto
router.use('/auth', authRoutes);
router.use('/geektopia', geektopiaRoutes);

module.exports = router;