const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');

// Agrupa todas as rotas sob o prefixo correto
router.use('/auth', authRoutes);

module.exports = router;