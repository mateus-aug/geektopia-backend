const { enviarEmail } = require('./email');
const { gerarTokenEmail } = require('../utils/tokenEmail');

// Manda o e-mail com o link de confirmação. Nunca lança erro: devolve true/false (sem SMTP, só false).
async function enviarConfirmacaoEmail(usuario) {
  const primeiroNome = String(usuario.nome_completo || '').trim().split(/\s+/)[0];
  const token = gerarTokenEmail(usuario);
  return enviarEmail({
    para: usuario.email,
    assunto: 'Confirme o seu e-mail — NEXUS',
    texto:
      `Olá${primeiroNome ? `, ${primeiroNome}` : ''}.\n\n` +
      'Para receber os seus ingressos e os avisos da CCPOP por e-mail, confirme que este endereço é seu. ' +
      'Clique no botão abaixo.\n\n' +
      'O link vale por 48 horas. Se você não criou uma conta no NEXUS, ignore esta mensagem.',
    link: `/confirmar-email?token=${encodeURIComponent(token)}`
  });
}

module.exports = { enviarConfirmacaoEmail };
