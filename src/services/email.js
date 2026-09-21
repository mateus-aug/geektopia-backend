// E-MAIL (opcional e gratuito). Usa SMTP comum (ex.: Gmail com "senha de app", 500 e-mails/dia)
// pela biblioteca livre nodemailer. Configure no .env:
//   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=seuemail@gmail.com  SMTP_PASS=<senha de app>
//   EMAIL_REMETENTE="CCPOP <seuemail@gmail.com>"
// Sem essas variáveis, NADA é enviado (e nada quebra): as notificações continuam aparecendo no site.
let transporte = null;

const configurado = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function obterTransporte() {
  if (transporte) return transporte;
  const nodemailer = require('nodemailer');
  const porta = Number(process.env.SMTP_PORT) || 465;
  transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: porta, secure: porta === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporte;
}

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Devolve true se enviou; false se o e-mail não está configurado ou falhou (nunca lança erro).
async function enviarEmail({ para, assunto, texto, link }) {
  if (!configurado() || !para) return false;
  try {
    const base = String(process.env.URL_FRONTEND || '').split(',')[0].trim().replace(/\/$/, '');
    const url = link && base ? `${base}${link}` : null;
    await obterTransporte().sendMail({
      from: process.env.EMAIL_REMETENTE || process.env.SMTP_USER,
      to: para,
      subject: assunto,
      text: `${texto || ''}${url ? `\n\n${url}` : ''}\n\n— Conselho de Cultura POP de Ponta Grossa`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px"><h2 style="margin:0 0 12px">${escapar(assunto)}</h2><p style="line-height:1.5">${escapar(texto).replace(/\n/g, '<br>')}</p>${url ? `<p><a href="${escapar(url)}" style="background:#F7C531;color:#16151A;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Abrir no site</a></p>` : ''}<p style="color:#64636B;font-size:13px">Conselho de Cultura POP de Ponta Grossa</p></div>`
    });
    return true;
  } catch (erro) {
    console.error('Falha ao enviar e-mail:', erro.message);
    return false;
  }
}

module.exports = { enviarEmail, emailConfigurado: configurado };
