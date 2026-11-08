// RECUPERAÇÃO DE SENHA ("Esqueci a minha senha").
//
// O que estes testes garantem, em ordem de importância:
//   1. a tela não revela quem tem cadastro (resposta idêntica para e-mail que
//      existe e e-mail que não existe);
//   2. o link é de USO ÚNICO — usar uma vez mata o link, sem tabela no banco;
//   3. token expirado, adulterado ou de login não trocam senha nenhuma;
//   4. a pessoa é avisada quando a senha dela muda.
//
// NUNCA ENVIA E-MAIL DE VERDADE: o SMTP é desligado no before. Com ele
// desligado o controller imprime o link no console (só fora de produção), e é
// daí que o teste pega o token — o mesmo token que iria no e-mail.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, jwt, bcrypt, iniciarServidor, criarUsuario, limparZZ } = require('./helpers/ambiente');
const { gerarToken } = require('../src/utils/tokenSenha');

const H = { 'Content-Type': 'application/json' };
const SENHA_VELHA = 'SenhaVelha@1';
const SENHA_NOVA = 'SenhaNova@2';

let servidor;
let smtpGuardado;
let warnOriginal;
let linksVistos = [];

test.before(async () => {
  await limparZZ();
  servidor = await iniciarServidor();

  // Garante que nenhum e-mail sai daqui.
  smtpGuardado = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;

  // Intercepta o link que o controller imprime quando o SMTP está desligado.
  warnOriginal = console.warn;
  console.warn = (...args) => {
    const achado = args.join(' ').match(/token=([^\s]+)/);
    if (achado) linksVistos.push(decodeURIComponent(achado[1]));
    else warnOriginal(...args);
  };
});

test.after(async () => {
  console.warn = warnOriginal;
  if (smtpGuardado) process.env.SMTP_HOST = smtpGuardado;
  delete process.env.RATE_LIMIT_ATIVO;
  await limparZZ();
  await servidor.fechar();
  await prisma.$disconnect();
});

/** Pede o link e devolve o token que acabou de ser gerado. */
async function pedirLink(email) {
  linksVistos = [];
  const r = await servidor.call('POST', '/auth/forgot-password', H, { email });
  return { r, token: linksVistos[0] };
}

test('a tela de recuperação não revela quem tem cadastro', async () => {
  const { u } = await criarUsuario('recup.sigilo', { senha: await bcrypt.hash(SENHA_VELHA, 4) });

  const existe = await servidor.call('POST', '/auth/forgot-password', H, { email: u.email });
  const naoExiste = await servidor.call('POST', '/auth/forgot-password', H, { email: 'zz.ninguem.jamais@teste.local' });

  assert.equal(existe.s, 200);
  assert.equal(naoExiste.s, 200, 'e-mail inexistente também responde 200');
  assert.deepEqual(naoExiste.b, existe.b, 'as respostas têm de ser idênticas, senão a tela vira consulta de cadastro');

  // Formato obviamente inválido pode reclamar: fala do que foi digitado, não de quem existe.
  assert.equal((await servidor.call('POST', '/auth/forgot-password', H, { email: 'sem-arroba' })).s, 400);
  assert.equal((await servidor.call('POST', '/auth/forgot-password', H, {})).s, 400);
});

test('o link do e-mail troca a senha e serve uma única vez', async () => {
  const { u } = await criarUsuario('recup.usounico', { senha: await bcrypt.hash(SENHA_VELHA, 4) });
  const { r, token } = await pedirLink(u.email);

  assert.equal(r.s, 200);
  assert.ok(token && token.length > 40, 'o controller precisa gerar um token para quem existe');

  // Antes de redefinir, a senha nova não vale nada.
  assert.equal((await servidor.call('POST', '/auth/login', H, { email: u.email, senha: SENHA_NOVA })).s, 401);

  const troca = await servidor.call('POST', '/auth/reset-password', H, { token, nova_senha: SENHA_NOVA });
  assert.equal(troca.s, 200, JSON.stringify(troca.b));

  assert.equal((await servidor.call('POST', '/auth/login', H, { email: u.email, senha: SENHA_NOVA })).s, 200, 'login com a senha nova');
  assert.equal((await servidor.call('POST', '/auth/login', H, { email: u.email, senha: SENHA_VELHA })).s, 401, 'a senha antiga morre');

  // ESTE É O TESTE CENTRAL: o mesmo link não pode funcionar de novo.
  const reuso = await servidor.call('POST', '/auth/reset-password', H, { token, nova_senha: 'TerceiraSenha@3' });
  assert.equal(reuso.s, 400, 'link já usado tem de ser recusado');
  assert.equal((await servidor.call('POST', '/auth/login', H, { email: u.email, senha: 'TerceiraSenha@3' })).s, 401,
    'a senha da tentativa de reuso não pode ter entrado');

  // E a pessoa foi avisada da troca (sininho + e-mail), para reagir se não foi ela.
  const avisos = await prisma.notificacao.findMany({ where: { id_usuario: u.id_usuario } });
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].tipo, 'senha_alterada');
});

test('trocar a senha pelo caminho normal invalida o link pendente', async () => {
  const { u, H: autenticado } = await criarUsuario('recup.cruzado', { senha: await bcrypt.hash(SENHA_VELHA, 4) });
  const { token } = await pedirLink(u.email);

  // A pessoa lembrou a senha e trocou pelo painel, sem usar o link.
  const normal = await servidor.call('PATCH', '/auth/change-password', autenticado, {
    senha_atual: SENHA_VELHA, nova_senha: SENHA_NOVA
  });
  assert.equal(normal.s, 200, JSON.stringify(normal.b));

  // O link que estava na caixa de entrada tem de estar morto.
  const tarde = await servidor.call('POST', '/auth/reset-password', H, { token, nova_senha: 'OutraAinda@4' });
  assert.equal(tarde.s, 400, 'o link vira pó quando a senha muda por outro caminho');
});

test('token adulterado, expirado ou de login não redefine senha', async () => {
  const { u } = await criarUsuario('recup.tokenruim', { senha: await bcrypt.hash(SENHA_VELHA, 4) });
  const usuario = await prisma.usuario.findUnique({ where: { id_usuario: u.id_usuario } });
  const bom = gerarToken(usuario);

  const adulterado = bom.slice(0, -3) + (bom.endsWith('aaa') ? 'bbb' : 'aaa');
  const expirado = jwt.sign({ id: u.id_usuario, tipo: 'recuperacao-senha' },
    `${process.env.JWT_SECRET}|${usuario.senha}`, { expiresIn: -60 });
  const deLogin = jwt.sign({ id: u.id_usuario, isAdmin: false }, process.env.JWT_SECRET, { expiresIn: '15m' });

  const respostas = [];
  for (const t of [adulterado, expirado, deLogin, 'isto-nao-e-um-jwt', '']) {
    const r = await servidor.call('POST', '/auth/reset-password', H, { token: t, nova_senha: SENHA_NOVA });
    assert.equal(r.s, 400, `token recusado: ${String(t).slice(0, 24)}`);
    respostas.push(r.b.error);
  }

  // Os três primeiros são "link ruim" e têm de dar a MESMA mensagem: dizer qual
  // dos problemas foi ajudaria quem está tentando adivinhar um link.
  assert.equal(respostas[0], respostas[1]);
  assert.equal(respostas[1], respostas[2]);

  // E nada mudou: a senha velha continua valendo.
  assert.equal((await servidor.call('POST', '/auth/login', H, { email: u.email, senha: SENHA_VELHA })).s, 200);
});

test('senha fraca é recusada sem gastar o link', async () => {
  const { u } = await criarUsuario('recup.senhafraca', { senha: await bcrypt.hash(SENHA_VELHA, 4) });
  const { token } = await pedirLink(u.email);

  for (const fraca of ['123', 'semmaiuscula1!', 'SEMMINUSCULA1!', 'SemNumero!!', 'SemEspecial1', '']) {
    const r = await servidor.call('POST', '/auth/reset-password', H, { token, nova_senha: fraca });
    assert.equal(r.s, 400, `senha fraca recusada: ${fraca}`);
    assert.match(r.b.error, /mai[úu]scula/, 'a mensagem explica o que falta');
  }

  // O link NÃO foi queimado pelas tentativas fracas — a senha é checada antes do token.
  assert.equal((await servidor.call('POST', '/auth/reset-password', H, { token, nova_senha: SENHA_NOVA })).s, 200);
});

test('insistir no pedido de link bate no limite de tentativas', async () => {
  process.env.RATE_LIMIT_ATIVO = 'true';
  const email = 'zz.recup.limite@teste.local'; // e-mail próprio, para não afetar os outros testes
  let bloqueou = false;
  for (let i = 0; i < 14 && !bloqueou; i++) {
    bloqueou = (await servidor.call('POST', '/auth/forgot-password', H, { email })).s === 429;
  }
  delete process.env.RATE_LIMIT_ATIVO;
  assert.ok(bloqueou, 'a rota precisa ter freio contra robô pedindo link em série');
});
