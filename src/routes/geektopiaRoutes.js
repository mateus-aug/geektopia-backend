const express = require('express');
const router = express.Router();
const geektopiaController = require('../controllers/geektopiaController');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
// A listagem de lotes fica sob este prefixo por ser rota aninhada
// (/api/geektopia/:id/lotes), mas a lógica pertence ao loteController.
const loteController = require('../controllers/loteController');
const programacaoController = require('../controllers/programacaoController');
const competicaoController = require('../controllers/competicaoController');
const vitrineController = require('../controllers/vitrineController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Rotas administrativas. Declaradas antes das que usam ':id' para deixar
// claro que '/admin/...' é caminho fixo, não um identificador.
router.get('/admin/todas', authMiddleware, adminMiddleware, geektopiaController.listarTodas);
router.get('/admin/:id', authMiddleware, adminMiddleware, geektopiaController.buscarPorId);
router.get('/admin/:id/lotes', authMiddleware, adminMiddleware, loteController.listarPorGeektopia);
router.get('/admin/:id/programacao', authMiddleware, adminMiddleware, programacaoController.listarPorGeektopia);
router.get('/admin/:id/competicoes', authMiddleware, adminMiddleware, competicaoController.listarPorGeektopia);
router.get('/admin/:id/convidados', authMiddleware, adminMiddleware, vitrineController.listarConvidados);
router.get('/admin/:id/fotos', authMiddleware, adminMiddleware, vitrineController.listarFotos);
router.put('/:id', authMiddleware, adminMiddleware, geektopiaController.atualizar);
router.patch('/:id/status', authMiddleware, adminMiddleware, geektopiaController.alterarStatus);
router.delete('/:id', authMiddleware, adminMiddleware, geektopiaController.remover);
router.patch('/:id/tornar-principal', authMiddleware, adminMiddleware, geektopiaController.tornarPrincipal);
router.patch('/:id/banner', authMiddleware, adminMiddleware, uploadMiddleware.eventos.single('banner'), geektopiaController.uploadBanner);
router.post('/', authMiddleware, adminMiddleware, uploadMiddleware.eventos.single('banner'), geektopiaController.criar);

// Rotas públicas: qualquer visitante acessa, sem token.
router.get('/', geektopiaController.listarPublicas);
// Antes de '/:id', senão "vitrine" seria lido como um identificador.
router.get('/vitrine', vitrineController.vitrinePublica);
router.get('/:id', geektopiaController.buscarPorId);
router.get('/:id/lotes', loteController.listarPorGeektopia);
router.get('/:id/programacao', programacaoController.listarPorGeektopia);
router.get('/:id/competicoes', competicaoController.listarPorGeektopia);
router.get('/:id/convidados', vitrineController.listarConvidados);
router.get('/:id/fotos', vitrineController.listarFotos);
router.get('/:id/expositores-confirmados', vitrineController.listarExpositoresConfirmados);

module.exports = router;
