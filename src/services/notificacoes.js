const prisma = require('../config/prisma');
const { enviarEmail } = require('./email');

// NOTIFICAÇÕES: um aviso dentro do site (sininho) e, se o e-mail estiver configurado, também por e-mail.
// Nunca derruba quem chamou: se falhar, só registra no log (avisar é secundário ao que o usuário acabou de fazer).
//
//   notificar(idUsuario, { tipo, titulo, texto, link, email })   email: false para não enviar e-mail
//   notificarAdmins({ tipo, titulo, texto, link })                avisa todos os administradores

async function notificar(idUsuario, { tipo, titulo, texto = null, link = null, email = true }) {
  try {
    const n = await prisma.notificacao.create({ data: { id_usuario: idUsuario, tipo, titulo: String(titulo).slice(0, 150), texto, link } });
    if (email) {
      const u = await prisma.usuario.findUnique({ where: { id_usuario: idUsuario }, select: { email: true } });
      if (u?.email) enviarEmail({ para: u.email, assunto: titulo, texto, link });
    }
    return n;
  } catch (erro) {
    console.error('Falha ao criar notificação:', erro.message);
    return null;
  }
}

async function notificarAdmins(dados) {
  try {
    const admins = await prisma.administrador.findMany({ select: { id_usuario: true } });
    await Promise.all(admins.map((a) => notificar(a.id_usuario, { ...dados, email: false })));
  } catch (erro) {
    console.error('Falha ao notificar administradores:', erro.message);
  }
}

module.exports = { notificar, notificarAdmins };
