const express = require('express');
const router = express.Router();
const solicitacaoEspacoController = require('../controllers/solicitacaoEspacoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// TODAS as rotas exigem login. Não existe consulta pública aqui: candidatura
// de expositor contém valores e dados de contato, e só interessa a quem a fez
// e à diretoria.

// Fila de análise da diretoria. Declarada antes de '/:id' por ser caminho fixo.
router.get('/admin/todas', authMiddleware, adminMiddleware, solicitacaoEspacoController.listarTodas);
router.patch('/:id/status', authMiddleware, adminMiddleware, solicitacaoEspacoController.alterarStatus);

// Do expositor. O controller confere a posse pelo req.userId do token —
// nunca por um id vindo do corpo ou da URL.
router.post('/', authMiddleware, solicitacaoEspacoController.criar);
router.get('/minhas', authMiddleware, solicitacaoEspacoController.listarMinhas);
router.get('/:id', authMiddleware, solicitacaoEspacoController.buscarPorId);
router.put('/:id', authMiddleware, solicitacaoEspacoController.atualizar);
router.delete('/:id', authMiddleware, solicitacaoEspacoController.remover);
router.post('/:id/pagamento', authMiddleware, solicitacaoEspacoController.gerarPagamento);

// Ajudantes cadastrados na solicitação (nome/CPF), até o limite pago.
router.post('/:id/ajudantes', authMiddleware, solicitacaoEspacoController.adicionarAjudante);
router.get('/:id/ajudantes', authMiddleware, solicitacaoEspacoController.listarAjudantes);
router.delete('/:id/ajudantes/:idAjudante', authMiddleware, solicitacaoEspacoController.removerAjudante);

module.exports = router;
