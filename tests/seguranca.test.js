// SEGURANÇA DA API: limite de tentativas de login, CORS restrito e cabeçalhos de proteção.
process.env.RATE_LIMIT_ATIVO = 'true';
process.env.LIMITE_LOGIN_MAX = '3';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, iniciarServidor, limparZZ, criarUsuario } = require('./helpers/ambiente');

let servidor;
test.before(async () => { await limparZZ(); servidor = await iniciarServidor(); });
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

test('login: depois de 3 tentativas erradas, bloqueia (429) só aquele e-mail', async () => {
  await criarUsuario('seg1');
  const tenta = (email) => servidor.call('POST', '/auth/login', { 'Content-Type': 'application/json' }, { email, senha: 'errada' });
  for (let i = 0; i < 3; i += 1) assert.equal((await tenta('zz.seg1@teste.local')).s, 401);
  const bloqueado = await tenta('zz.seg1@teste.local');
  assert.equal(bloqueado.s, 429);
  assert.match(bloqueado.b.error, /Muitas tentativas/);
  assert.equal((await tenta('zz.outra.pessoa@teste.local')).s, 401, 'outro e-mail não é afetado');
});

test('CORS: só o front do projeto recebe permissão do navegador', async () => {
  const pedir = (origem) => fetch(`${servidor.base}/geektopia/vitrine`, { headers: origem ? { Origin: origem } : {} });
  const ok = await pedir('http://localhost:5173');
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const intruso = await pedir('https://site-malicioso.example');
  assert.equal(intruso.headers.get('access-control-allow-origin'), null, 'site desconhecido não recebe permissão');
  assert.equal((await pedir(null)).status, 200, 'chamadas sem Origin (Mercado Pago, curl) continuam funcionando');
});

test('cabeçalhos de segurança presentes e sem revelar a tecnologia', async () => {
  const r = await fetch(`${servidor.base}/geektopia/vitrine`);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
  assert.ok(r.headers.get('strict-transport-security'));
});

test('JSON gigante é recusado (413)', async () => {
  const r = await fetch(`${servidor.base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@b.c', senha: 'x'.repeat(300_000) }) });
  assert.equal(r.status, 413);
});
