const express = require('express');
const router = express.Router();
const institucionalController = require('../controllers/institucionalController');
const authMiddleware = require('../middlewares/authMiddleware');

// Guard provisório: barra quem não é administrador.
// Roda sempre DEPOIS do authMiddleware, que é quem preenche req.userIsAdmin.
function exigirAdmin(req, res, next) {
  // 403 e não 401: a pessoa está autenticada, só não tem permissão.
  if (req.userIsAdmin !== true) {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }

  return next();
}

// ---- História institucional ----
// Leitura pública: é o conteúdo da landing page.
router.get('/historia', institucionalController.listarHistoria);
router.get('/historia/:id', institucionalController.buscarHistoria);
router.post('/historia', authMiddleware, exigirAdmin, institucionalController.criarHistoria);
router.put('/historia/:id', authMiddleware, exigirAdmin, institucionalController.atualizarHistoria);
router.delete('/historia/:id', authMiddleware, exigirAdmin, institucionalController.removerHistoria);

// ---- Galeria de edições passadas ----
router.get('/galeria', institucionalController.listarGaleria);
router.get('/galeria/:id', institucionalController.buscarGaleria);
router.post('/galeria', authMiddleware, exigirAdmin, institucionalController.criarGaleria);
router.put('/galeria/:id', authMiddleware, exigirAdmin, institucionalController.atualizarGaleria);
router.delete('/galeria/:id', authMiddleware, exigirAdmin, institucionalController.removerGaleria);

module.exports = router;
