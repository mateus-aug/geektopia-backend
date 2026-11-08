const express = require('express');
const router = express.Router();

const recuperacaoSenhaController = require('../controllers/recuperacaoSenhaController');
const limites = require('../middlewares/limites');

// Rotas de "Esqueci a minha senha".
//
// POR QUE NUM ARQUIVO SEPARADO, E NÃO DENTRO DE authRoutes.js
// authRoutes.js e authController.js são da Maria. Como o Express permite
// montar mais de um roteador no mesmo prefixo (ver routes/index.js), estas duas
// rotas aparecem em /api/auth/... sem precisar editar os arquivos dela. Se um
// caminho não casa aqui, o Express segue para o roteador seguinte — nada é
// sobrescrito ou interceptado.
//
// Ambas são PÚBLICAS: quem esqueceu a senha não consegue fazer login, então não
// há como exigir token de sessão. A proteção é o limite de tentativas abaixo.
//
// Reaproveita limites.login em vez de criar um limite novo: o middlewares/limites.js
// é arquivo compartilhado, e o limite de login já é exatamente o que se precisa
// aqui — 10 tentativas por 15 minutos, contadas por IP + e-mail, para que um
// robô não trave o site inteiro nem uma pessoa atrapalhe a outra.
router.post('/forgot-password', limites.login, recuperacaoSenhaController.solicitar);
router.post('/reset-password', limites.login, recuperacaoSenhaController.redefinir);

module.exports = router;
