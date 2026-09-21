// CADASTRO: gênero obrigatório (lista fixa), sexualidade opcional no perfil e aceite dos termos.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/utils/genero');
const { prisma, iniciarServidor, criarUsuario, limparZZ, CPFS } = require('./helpers/ambiente');

test('validação e classificação de gênero/sexualidade', () => {
  assert.equal(G.validarGenero('Feminino').valor, 'Feminino');
  assert.equal(G.validarGenero('Outro:   agênero fluido').valor, 'Outro: agênero fluido');
  assert.ok(G.validarGenero('Alienígena').erro);
  assert.ok(G.validarGenero('Outro: <script>').erro);
  assert.equal(G.validarGenero('').valor, null);
  assert.ok(G.validarSexualidade('qualquer coisa').erro);
  assert.equal(G.validarSexualidade('Outra: demissexual').valor, 'Outra: demissexual');
  assert.equal(G.categoriaGenero('Homem Cis'), 'Masculino');
  assert.equal(G.categoriaGenero('Outro: agênero'), 'Outro');
  assert.equal(G.categoriaGenero('Bigênero'), 'Não binário');
  assert.equal(G.categoriaGenero(null), 'Não informado');
  assert.equal(G.categoriaSexualidade('Bissexual'), 'Bissexual');
  assert.equal(G.categoriaSexualidade('xyz'), 'Outra');
});

let servidor;
test.before(async () => { await limparZZ(); servidor = await iniciarServidor(); });
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

const corpo = (n, extra = {}) => ({
  nome_completo: 'ZZ Pessoa Teste', cpf: CPFS[n % CPFS.length], data_nascimento: '1995-03-10', email: `zz.cad${n}@teste.local`, telefone: '42999998888',
  estado: 'PR', cidade: 'Ponta Grossa', senha: 'Senha@1234', genero: 'Feminino', aceite_termos: true, ...extra
});

test('cadastro exige gênero válido e aceite dos termos, e registra o aceite', async () => {
  const c = servidor.call; const H = { 'Content-Type': 'application/json' };
  const semGenero = await c('POST', '/auth/register', H, corpo(1, { genero: undefined }));
  assert.equal(semGenero.s, 400); assert.equal(semGenero.b.campo, 'genero');
  assert.equal((await c('POST', '/auth/register', H, corpo(1, { genero: 'Alienígena' }))).s, 400);
  const semAceite = await c('POST', '/auth/register', H, corpo(1, { aceite_termos: false }));
  assert.equal(semAceite.s, 400); assert.equal(semAceite.b.campo, 'aceitaTermos');
  assert.equal((await c('POST', '/auth/register', H, corpo(1, { sexualidade: 'xyz' }))).s, 400, 'sexualidade fora da lista');

  const ok = await c('POST', '/auth/register', H, corpo(1, { genero: 'Outro: agênero' }));
  assert.equal(ok.s, 201, JSON.stringify(ok.b));
  const u = await prisma.usuario.findUnique({ where: { email: 'zz.cad1@teste.local' } });
  assert.equal(u.genero, 'Outro: agênero');
  assert.ok(u.termos_aceitos_em && u.termos_versao, 'guarda quando e qual versão foi aceita');
  assert.equal(u.sexualidade, null, 'sexualidade não é pedida no cadastro');
});

test('perfil: sexualidade opcional e gênero não pode ficar vazio', async () => {
  const { H } = await criarUsuario('cad2', { genero: 'Masculino' }); const c = servidor.call;
  assert.equal((await c('PUT', '/auth/profile', H, { sexualidade: 'Bissexual' })).s, 200);
  assert.equal((await prisma.usuario.findUnique({ where: { email: 'zz.cad2@teste.local' } })).sexualidade, 'Bissexual');
  assert.equal((await c('PUT', '/auth/profile', H, { sexualidade: 'coisa' })).s, 400);
  assert.equal((await c('PUT', '/auth/profile', H, { genero: '' })).s, 400, 'gênero não pode ser apagado');
  assert.equal((await c('PUT', '/auth/profile', H, { genero: 'Não binário' })).s, 200);
  assert.equal((await c('PUT', '/auth/profile', H, { sexualidade: '' })).s, 200, 'pode limpar a sexualidade');
});
