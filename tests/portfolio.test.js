// PORTFÓLIO OBRIGATÓRIO: sem link para avaliar, não há inscrição, loja nem evento da comunidade.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, iniciarServidor, cabecalho, criarUsuario, limparZZ } = require('./helpers/ambiente');

let servidor; let admin;
test.before(async () => {
  await limparZZ(); servidor = await iniciarServidor();
  admin = cabecalho((await prisma.administrador.findFirst()).id_usuario, true);
});
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

test('expositor exige portfólio (link http/https)', async () => {
  const { H } = await criarUsuario('pf1'); const c = servidor.call;
  assert.equal((await c('POST', '/parceiros/expositor', H, { nome_loja_projeto: 'ZZ Loja' })).s, 400, 'sem portfólio');
  assert.equal((await c('POST', '/parceiros/expositor', H, { nome_loja_projeto: 'ZZ Loja', url_portfolio: 'meu insta' })).s, 400, 'texto solto');
  assert.equal((await c('POST', '/parceiros/expositor', H, { nome_loja_projeto: 'ZZ Loja', url_portfolio: 'javascript:alert(1)' })).s, 400);
  assert.equal((await c('POST', '/parceiros/expositor', H, { nome_loja_projeto: 'ZZ Loja', url_portfolio: 'https://instagram.com/zz' })).s, 201);
  assert.equal((await c('PUT', '/parceiros/expositor', H, { url_portfolio: null })).s, 400, 'não dá para apagar depois');
});

test('inscrição em competição exige material de apresentação', async () => {
  const ed = await prisma.geektopia.create({ data: { nome_edicao: 'ZZ EDICAO PF', tipo_edicao: 'Pocket', status_evento: 'VendasAbertas', classificacao_etaria: 0 } });
  const comp = (await servidor.call('POST', '/competicoes', admin, { id_geektopia: ed.id_geektopia, nome_competicao: 'ZZ Cosplay', modalidade: 'Solo', valor_taxa_inscricao: 0 })).b;
  const id = (comp.competicao || comp).id_competicao;
  const { H } = await criarUsuario('pf2'); const c = servidor.call;
  await c('POST', '/parceiros/competidor', H, { nickname_competidor: 'zzpf' });
  assert.equal((await c('POST', '/inscricoes', H, { id_competicao: id })).s, 400, 'sem material');
  assert.equal((await c('POST', '/inscricoes', H, { id_competicao: id, url_portfolio_apresentacao: 'não é link' })).s, 400);
  assert.equal((await c('POST', '/inscricoes', H, { id_competicao: id, url_portfolio_apresentacao: 'https://drive.google.com/zz' })).s, 201);
});

test('evento da comunidade exige link', async () => {
  const { H } = await criarUsuario('pf3'); const c = servidor.call;
  const base = { nome_evento: 'ZZ Ev', data_evento: new Date(Date.now() + 5 * 864e5).toISOString(), local: 'Ginásio', descricao: 'x' };
  assert.equal((await c('POST', '/eventos-comunidade', H, base)).s, 400, 'sem link');
  assert.equal((await c('POST', '/eventos-comunidade', H, { ...base, url_portfolio: '', url_saiba_mais: 'https://instagram.com/zz' })).s, 201);
});
