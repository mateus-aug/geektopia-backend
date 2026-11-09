// CONFIRMAÇÃO DE E-MAIL: link assinado de 48h, só endereços confirmados recebem e-mail, e nada é enviado de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { prisma, iniciarServidor, cabecalho, criarUsuario, limparZZ, CPFS } = require('./helpers/ambiente');

// Simula o envio: o nodemailer é trocado ANTES de carregar o serviço de e-mail e o SMTP é falso. Nada sai de verdade.
const enviados = [];
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({ sendMail: async (m) => { enviados.push(m); return {}; } });
process.env.SMTP_HOST = 'smtp.falso.test'; process.env.SMTP_USER = 'ccpop@falso.test'; process.env.SMTP_PASS = 'falsa';
const { gerarTokenEmail } = require('../src/utils/tokenEmail');
const { notificar } = require('../src/services/notificacoes');

let servidor; let admin;
test.before(async () => { await limparZZ(); servidor = await iniciarServidor(); admin = cabecalho((await prisma.administrador.findFirst()).id_usuario, true); });
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });
const J = { 'Content-Type': 'application/json' };
const aguardar = (ms) => new Promise((r) => setTimeout(r, ms));

test('cadastro envia o link; o link confirma uma vez; links ruins são recusados', async () => {
  const c = servidor.call; enviados.length = 0;
  const reg = await c('POST', '/auth/register', J, {
    nome_completo: 'ZZ Pessoa Confirma', cpf: CPFS[0], data_nascimento: '1995-03-10', email: 'zz.conf1@teste.local', telefone: '42999998888',
    estado: 'PR', cidade: 'Ponta Grossa', senha: 'Senha@1234', genero: 'Feminino', aceite_termos: true
  });
  assert.equal(reg.s, 201, JSON.stringify(reg.b));
  await aguardar(300);
  const email = enviados.find((m) => m.to === 'zz.conf1@teste.local');
  assert.ok(email, 'o e-mail de confirmação foi enviado');
  assert.match(email.html, /Confirmar meu e-mail/); assert.match(email.text, /\/confirmar-email\?token=/);

  const u = await prisma.usuario.findUnique({ where: { email: 'zz.conf1@teste.local' } });
  assert.equal(u.email_confirmado_em, null, 'nasce não confirmado');
  const token = decodeURIComponent(email.text.match(/token=([^\s]+)/)[1]);

  assert.equal((await c('POST', '/auth/confirmar-email', J, { token: 'lixo' })).s, 400);
  assert.equal((await c('POST', '/auth/confirmar-email', J, { token: jwt.sign({ id: u.id_usuario, email: u.email }, process.env.JWT_SECRET) })).s, 400, 'token de login não confirma');
  const expirado = jwt.sign({ id: u.id_usuario, email: u.email, tipo: 'confirmar-email' }, `${process.env.JWT_SECRET}|confirmar-email`, { expiresIn: -10 });
  assert.equal((await c('POST', '/auth/confirmar-email', J, { token: expirado })).s, 400, 'expirado');

  const ok = await c('POST', '/auth/confirmar-email', J, { token });
  assert.equal(ok.s, 200, JSON.stringify(ok.b));
  assert.ok((await prisma.usuario.findUnique({ where: { email: 'zz.conf1@teste.local' } })).email_confirmado_em);
  assert.equal((await c('POST', '/auth/confirmar-email', J, { token })).b.jaConfirmado, true, 'repetir não faz mal');
});

test('trocar o e-mail invalida o link antigo e a confirmação', async () => {
  const c = servidor.call; const { u } = await criarUsuario('conf2');
  const antigo = gerarTokenEmail(u);
  await prisma.usuario.update({ where: { id_usuario: u.id_usuario }, data: { email: 'zz.conf2novo@teste.local' } });
  assert.equal((await c('POST', '/auth/confirmar-email', J, { token: antigo })).s, 400, 'o link do e-mail antigo não vale');

  const { u: u3 } = await criarUsuario('conf3');
  await prisma.usuario.update({ where: { id_usuario: u3.id_usuario }, data: { email_confirmado_em: new Date() } });
  const r = await c('PUT', `/auth/admin/users/${u3.id_usuario}`, admin, { email: 'zz.conf3novo@teste.local', cpf: CPFS[2] });
  assert.equal(r.s, 200, JSON.stringify(r.b));
  assert.equal((await prisma.usuario.findUnique({ where: { id_usuario: u3.id_usuario } })).email_confirmado_em, null, 'e-mail novo volta a não confirmado');
});

test('só e-mail confirmado recebe aviso por e-mail (o sininho chega para todos)', async () => {
  const sem = await criarUsuario('conf4'); const com = await criarUsuario('conf5');
  await prisma.usuario.update({ where: { id_usuario: com.u.id_usuario }, data: { email_confirmado_em: new Date() } });
  enviados.length = 0;
  await notificar(sem.u.id_usuario, { tipo: 'zz', titulo: 'Aviso ZZ' });
  await notificar(com.u.id_usuario, { tipo: 'zz', titulo: 'Aviso ZZ' });
  await aguardar(300);
  assert.equal(enviados.filter((m) => m.to === sem.u.email).length, 0, 'não confirmado: sem e-mail');
  assert.equal(enviados.filter((m) => m.to === com.u.email).length, 1, 'confirmado: recebe');
  assert.equal(await prisma.notificacao.count({ where: { id_usuario: sem.u.id_usuario } }), 1, 'mas o aviso no sininho existe');
});

test('reenviar: só logado, só quem ainda não confirmou', async () => {
  const c = servidor.call; const { u, H } = await criarUsuario('conf6');
  assert.equal((await c('POST', '/auth/reenviar-confirmacao', {})).s, 401);
  enviados.length = 0;
  const r = await c('POST', '/auth/reenviar-confirmacao', H);
  assert.equal(r.s, 200, JSON.stringify(r.b));
  await aguardar(300);
  assert.equal(enviados.filter((m) => m.to === u.email).length, 1);
  await prisma.usuario.update({ where: { id_usuario: u.id_usuario }, data: { email_confirmado_em: new Date() } });
  assert.equal((await c('POST', '/auth/reenviar-confirmacao', H)).s, 409, 'já confirmado');
});
