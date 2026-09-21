const rateLimit = require('express-rate-limit');

// LIMITES DE USO (proteção contra força bruta, robôs e abuso).
// Em teste ficam desligados, a menos que RATE_LIMIT_ATIVO=true (o teste de limites liga).
const ativo = () => process.env.RATE_LIMIT_ATIVO === 'true' || process.env.NODE_ENV !== 'test';

const num = (nome, padrao) => Number(process.env[nome]) || padrao;

function criar({ janelaMin, max, mensagem, chave }) {
  return rateLimit({
    windowMs: janelaMin * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !ativo(),
    keyGenerator: chave, // por padrão, o IP
    message: { error: mensagem },
    validate: { keyGeneratorIpFallback: false }
  });
}

// Login: freia tentativa de adivinhar senha. Conta por IP + e-mail (um robô não trava o site todo, e uma pessoa
// digitando errado não é bloqueada por causa de outra).
const login = criar({
  janelaMin: 15,
  get max() { return num('LIMITE_LOGIN_MAX', 10); },
  mensagem: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.',
  chave: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`
});

// Cadastro: evita criação de contas em massa.
const cadastro = criar({
  janelaMin: 60,
  get max() { return num('LIMITE_CADASTRO_MAX', 15); },
  mensagem: 'Muitos cadastros a partir desta conexão. Tente novamente mais tarde.'
});

// Uploads: cada pessoa logada tem uma cota por hora (o armazenamento é o recurso mais caro).
const upload = criar({
  janelaMin: 60,
  get max() { return num('LIMITE_UPLOAD_MAX', 30); },
  mensagem: 'Muitos envios de imagem em pouco tempo. Tente novamente mais tarde.',
  chave: (req) => `u${req.userId || req.ip}`
});

// Geral: teto folgado para a API inteira (o webhook do Mercado Pago fica de fora).
const geral = criar({
  janelaMin: 5,
  get max() { return num('LIMITE_GERAL_MAX', 600); },
  mensagem: 'Muitas requisições. Aguarde um instante.'
});

module.exports = { login, cadastro, upload, geral };
