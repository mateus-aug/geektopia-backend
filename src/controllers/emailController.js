const prisma = require('../config/prisma');
const { lerTokenEmail } = require('../utils/tokenEmail');
const { enviarConfirmacaoEmail } = require('../services/confirmacaoEmail');
const { emailConfigurado } = require('../services/email');

// POST /api/auth/confirmar-email { token } — público: quem clica no link do e-mail pode nem estar logado.
exports.confirmar = async (req, res) => {
  try {
    const dados = lerTokenEmail(req.body?.token);
    const invalido = { error: 'Este link é inválido ou expirou. Entre na sua conta e peça um novo e-mail de confirmação.' };
    if (!dados) return res.status(400).json(invalido);

    const usuario = await prisma.usuario.findUnique({ where: { id_usuario: dados.id }, select: { email: true, email_confirmado_em: true, inativado_em: true } });
    // O e-mail do token precisa ser o e-mail ATUAL da conta (se mudou, o link antigo não vale).
    if (!usuario || usuario.inativado_em || usuario.email !== dados.email) return res.status(400).json(invalido);

    if (usuario.email_confirmado_em) return res.json({ message: 'Seu e-mail já estava confirmado.', jaConfirmado: true });
    await prisma.usuario.update({ where: { id_usuario: dados.id }, data: { email_confirmado_em: new Date() } });
    return res.json({ message: 'E-mail confirmado! Agora você vai receber os seus ingressos e avisos por e-mail.' });
  } catch (e) {
    console.error('Erro ao confirmar e-mail:', e);
    return res.status(500).json({ error: 'Não foi possível confirmar o e-mail agora. Tente de novo.' });
  }
};

// POST /api/auth/reenviar-confirmacao — da pessoa logada.
exports.reenviar = async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id_usuario: req.userId }, select: { id_usuario: true, email: true, nome_completo: true, email_confirmado_em: true } });
    if (!usuario) return res.status(404).json({ error: 'Conta não encontrada.' });
    if (usuario.email_confirmado_em) return res.status(409).json({ error: 'Seu e-mail já está confirmado.' });
    if (!emailConfigurado()) return res.status(503).json({ error: 'O envio de e-mails está indisponível no momento. Tente mais tarde.' });
    enviarConfirmacaoEmail(usuario);
    return res.json({ message: `Enviamos um novo link para ${usuario.email}. Confira também o spam.` });
  } catch (e) {
    console.error('Erro ao reenviar confirmação de e-mail:', e);
    return res.status(500).json({ error: 'Não foi possível reenviar agora. Tente de novo.' });
  }
};
