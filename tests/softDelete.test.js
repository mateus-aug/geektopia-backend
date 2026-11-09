// SOFT DELETE: conta com atividade é inativada (nunca apagada), conta sem atividade pode ser excluída, e o admin reativa.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, iniciarServidor, cabecalho, criarUsuario, criarEdicaoComLotes, limparZZ, CPFS, titular } = require('./helpers/ambiente');

let servidor; let admin; let adminId;
test.before(async () => {
  await limparZZ(); servidor = await iniciarServidor();
  const adm = await prisma.administrador.findFirst(); adminId = adm.id_usuario; admin = cabecalho(adminId, true);
});
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

const H = { 'Content-Type': 'application/json' };
const comAtividade = async (sufixo) => {
  const { u, H: auth } = await criarUsuario(sufixo);
  const { lotes: [lote] } = await criarEdicaoComLotes([{ nome_lote: `ZZ Lote ${sufixo}`, valor_ingresso: 10, quantidade_total: 10 }]);
  const r = await servidor.call('POST', '/pedidos', auth, { itens: [{ id_lote: lote.id_lote, quantidade: 1, titulares: [titular('Ana Souza', CPFS[0])] }] });
  assert.equal(r.s, 201, JSON.stringify(r.b));
  return { u, auth };
};

test('conta com atividade: exige a senha, é inativada e perde o acesso, sem apagar o histórico', async () => {
  const { u, auth } = await comAtividade('sd1'); const c = servidor.call;
  assert.equal((await c('DELETE', '/auth/delete-account', auth, {})).s, 403, 'sem senha não encerra');
  assert.equal((await c('DELETE', '/auth/delete-account', auth, { senha: 'errada' })).s, 403, 'senha errada');
  const r = await c('DELETE', '/auth/delete-account', auth, { senha: 'x' });
  assert.equal(r.s, 200, JSON.stringify(r.b)); assert.equal(r.b.inativada, true);

  const banco = await prisma.usuario.findUnique({ where: { id_usuario: u.id_usuario } });
  assert.ok(banco, 'o usuário continua no banco');
  assert.ok(banco.inativado_em);
  assert.equal(await prisma.pedido.count({ where: { id_usuario: u.id_usuario } }), 1, 'o pedido continua guardado');

  assert.equal((await c('GET', '/auth/me', auth)).s, 403, 'token antigo não vale mais');
  const login = await c('POST', '/auth/login', H, { email: u.email, senha: 'x' });
  assert.equal(login.s, 403); assert.equal(login.b.inativa, true);
  assert.equal((await c('POST', '/auth/login', H, { email: u.email, senha: 'errada' })).s, 401, 'senha errada não revela que a conta está inativa');
});

test('conta sem atividade é excluída de verdade', async () => {
  const { u, H: auth } = await criarUsuario('sd2');
  const r = await servidor.call('DELETE', '/auth/delete-account', auth, { senha: 'x' });
  assert.equal(r.s, 200); assert.equal(r.b.inativada, false);
  assert.equal(await prisma.usuario.count({ where: { id_usuario: u.id_usuario } }), 0);
});

test('admin inativa e reativa; não inativa admin nem a si mesmo; lista filtra por situação', async () => {
  const { u, H: auth } = await criarUsuario('sd3'); const c = servidor.call;
  assert.equal((await c('PATCH', `/auth/admin/users/${u.id_usuario}/inativar`, auth, {})).s, 403, 'usuário comum não pode');
  assert.equal((await c('PATCH', `/auth/admin/users/${adminId}/inativar`, admin, {})).s, 409, 'nem a si mesmo');
  assert.equal((await c('PATCH', `/auth/admin/users/${u.id_usuario}/inativar`, admin, { motivo: 'ZZ teste' })).s, 200);
  assert.equal((await c('PATCH', `/auth/admin/users/${u.id_usuario}/inativar`, admin, {})).s, 409, 'já inativa');

  const inativos = (await c('GET', '/auth/admin/users?situacao=inativa&q=zz.sd3', admin)).b;
  assert.equal(inativos.itens.length, 1); assert.equal(inativos.itens[0].inativado_motivo, 'ZZ teste');
  assert.equal((await c('GET', '/auth/admin/users?situacao=ativa&q=zz.sd3', admin)).b.itens.length, 0);

  assert.equal((await c('GET', '/auth/me', auth)).s, 403);
  assert.equal((await c('PATCH', `/auth/admin/users/${u.id_usuario}/reativar`, admin)).s, 200);
  assert.equal((await c('GET', '/auth/me', auth)).s, 200, 'depois de reativada volta a entrar');
  assert.equal((await c('PATCH', `/auth/admin/users/${u.id_usuario}/reativar`, admin)).s, 409, 'já ativa');
});

test('conta inativa não recebe e-mail de aviso e fica fora do relatório de cadastros', async () => {
  const { u } = await criarUsuario('sd4', { cidade: 'Cidade ZZ Inativa', estado: 'PR', genero: 'Feminino' });
  const c = servidor.call;
  const ativos = (await c('GET', '/relatorios/painel?base=cadastros&cidade=Cidade ZZ Inativa', admin)).b;
  assert.equal(ativos.resumo.total_pessoas, 1);
  await prisma.usuario.update({ where: { id_usuario: u.id_usuario }, data: { inativado_em: new Date() } });
  const depois = (await c('GET', '/relatorios/painel?base=cadastros&cidade=Cidade ZZ Inativa', admin)).b;
  assert.equal(depois.resumo.total_pessoas, 0);
});
