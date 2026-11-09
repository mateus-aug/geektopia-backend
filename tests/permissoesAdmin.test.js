// PERMISSÃO DE ADMINISTRADOR: a palavra final é do banco, não do token.
//
// O token de login vale 7 dias e carrega "isAdmin". Antes desta correção, o
// sistema acreditava só no token — então um administrador rebaixado, ou marcado
// como Inativo, continuava com poder total até o token vencer, inclusive para
// abrir inscrições, pedidos e ingressos de outras pessoas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, jwt, bcrypt, iniciarServidor, criarUsuario, limparZZ } = require('./helpers/ambiente');

let servidor;
test.before(async () => { await limparZZ(); servidor = await iniciarServidor(); });
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

const H = { 'Content-Type': 'application/json' };
const comToken = (id, isAdmin) => ({
  ...H,
  Authorization: `Bearer ${jwt.sign({ id, isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' })}`
});

/** Uma inscrição de OUTRA pessoa, para testar acesso a dado alheio. */
async function inscricaoAlheia() {
  const { u: dono } = await criarUsuario('perm.dono');
  await prisma.participante.create({ data: { id_usuario: dono.id_usuario } });
  await prisma.competidor.create({ data: { id_usuario: dono.id_usuario, nickname_competidor: 'ZZ Dono' } });
  const ed = await prisma.geektopia.create({
    data: { nome_edicao: 'ZZ PERM', tipo_edicao: 'Pocket', status_evento: 'VendasAbertas', classificacao_etaria: 0 }
  });
  const comp = await prisma.competicao.create({
    data: { id_geektopia: ed.id_geektopia, nome_competicao: 'ZZ Perm', modalidade: 'Solo', valor_taxa_inscricao: 0 }
  });
  return prisma.inscricao_Competicao.create({
    data: { id_competicao: comp.id_competicao, id_usuario: dono.id_usuario, status_inscricao: 'EmAnalise' }
  });
}

test('admin REBAIXADO perde o acesso na hora, mesmo com o token antigo', async () => {
  const { u } = await criarUsuario('perm.rebaixado');
  await prisma.administrador.create({ data: { id_usuario: u.id_usuario } });
  const tokenAntigo = comToken(u.id_usuario, true);
  const alheia = await inscricaoAlheia();

  // Enquanto é admin: entra no painel e vê a inscrição alheia.
  assert.equal((await servidor.call('GET', '/inscricoes/admin/todas', tokenAntigo)).s, 200);
  assert.equal((await servidor.call('GET', `/inscricoes/${alheia.id_inscricao}`, tokenAntigo)).s, 200);

  // Outro admin o rebaixa.
  await prisma.administrador.delete({ where: { id_usuario: u.id_usuario } });

  // O MESMO token, ainda dentro dos 7 dias, não vale mais como admin.
  assert.equal((await servidor.call('GET', '/inscricoes/admin/todas', tokenAntigo)).s, 403, 'painel de admin');
  assert.equal((await servidor.call('GET', '/auth/admin/users', tokenAntigo)).s, 403, 'lista de usuários');
  assert.equal((await servidor.call('GET', `/inscricoes/${alheia.id_inscricao}`, tokenAntigo)).s, 404,
    'dado de outra pessoa deixa de ser visível');

  // E continua logado como usuário comum (não é expulso do site).
  assert.equal((await servidor.call('GET', '/auth/me', tokenAntigo)).s, 200);
});

test('admin INATIVO não tem poder de admin', async () => {
  const { u } = await criarUsuario('perm.inativo');
  await prisma.administrador.create({ data: { id_usuario: u.id_usuario, status_conta: 'Inativo' } });
  const t = comToken(u.id_usuario, true);
  assert.equal((await servidor.call('GET', '/relatorios/painel', t)).s, 403);
  assert.equal((await servidor.call('GET', '/auth/admin/users', t)).s, 403);

  await prisma.administrador.update({ where: { id_usuario: u.id_usuario }, data: { status_conta: 'Ativo' } });
  assert.equal((await servidor.call('GET', '/auth/admin/users', t)).s, 200, 'reativado volta a ter acesso');
});

test('token que DIZ ser admin, de quem nunca foi, não abre nada', async () => {
  const { u } = await criarUsuario('perm.impostor');
  const t = comToken(u.id_usuario, true);
  for (const rota of ['/auth/admin/users', '/geektopia/admin/todas', '/relatorios/painel', '/solicitacoes-espaco/admin/todas']) {
    assert.equal((await servidor.call('GET', rota, t)).s, 403, rota);
  }
});

test('login e promoção continuam funcionando normalmente', async () => {
  const { u } = await criarUsuario('perm.promovido', { senha: await bcrypt.hash('Senha@1234', 4) });
  const { u: chefe } = await criarUsuario('perm.chefe');
  await prisma.administrador.create({ data: { id_usuario: chefe.id_usuario } });
  const tChefe = comToken(chefe.id_usuario, true);

  assert.equal((await servidor.call('POST', `/auth/admin/promote/${u.id_usuario}`, tChefe, { nivel_permissao: 'SUPREMO' })).s, 400,
    'nível fora da lista é recusado (antes: 500)');
  assert.equal((await servidor.call('POST', '/auth/admin/promote/abc', tChefe, {})).s, 400, 'id inválido (antes: 500)');
  assert.equal((await servidor.call('POST', `/auth/admin/promote/${u.id_usuario}`, tChefe, {})).s, 201);

  // Depois de promovido, entra de novo e o token novo traz a permissão.
  const login = await servidor.call('POST', '/auth/login', H, { email: u.email, senha: 'Senha@1234' });
  assert.equal(login.s, 200);
  const tNovo = { ...H, Authorization: `Bearer ${login.b.token}` };
  assert.equal((await servidor.call('GET', '/auth/admin/users', tNovo)).s, 200);

  assert.equal((await servidor.call('PATCH', '/auth/admin/demote/abc', tChefe, {})).s, 400, 'id inválido (antes: 500)');
  assert.equal((await servidor.call('PATCH', `/auth/admin/demote/${chefe.id_usuario}`, tChefe, {})).s, 409,
    'ninguém rebaixa a si mesmo (o sistema não pode ficar sem admin)');
  assert.equal((await servidor.call('PATCH', `/auth/admin/demote/${u.id_usuario}`, tChefe, {})).s, 200);
  assert.equal((await servidor.call('GET', '/auth/admin/users', tNovo)).s, 403, 'rebaixado: o token novo também perde');
});
