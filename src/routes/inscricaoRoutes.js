const express = require('express');
const router = express.Router();
const inscricaoController = require('../controllers/inscricaoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// TODAS as rotas exigem login. Inscrição é sempre de quem está autenticado,
// e o controller lê o dono pelo req.userId do token.

// Rotas administrativas. Declaradas antes de '/:id' por serem caminho fixo.
router.get('/admin/todas', authMiddleware, adminMiddleware, inscricaoController.listarTodas);
router.patch('/admin/:id/status', authMiddleware, adminMiddleware, inscricaoController.alterarStatus);

// Do competidor.
router.post('/', authMiddleware, inscricaoController.criar);
router.get('/minhas', authMiddleware, inscricaoController.listarMinhas);
router.post('/:id/pagamento', authMiddleware, inscricaoController.gerarPagamento);
router.get('/:id', authMiddleware, inscricaoController.buscarPorId);
router.put('/:id', authMiddleware, inscricaoController.atualizar);
router.delete('/:id', authMiddleware, inscricaoController.remover);

module.exports = router;
