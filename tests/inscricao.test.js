// COMPETIÇÃO: inscrição sempre em análise, equipe, motivo da reprovação e taxa só depois da aprovação.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mp, prisma, iniciarServidor, cabecalho, criarUsuario, limparZZ, pagamentoAprovado } = require('./helpers/ambiente');

let servidor; let admin;
test.before(async () => {
  await limparZZ(); servidor = await iniciarServidor();
  admin = cabecalho((await prisma.administrador.findFirst()).id_usuario, true);
});
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

test('fluxo completo da inscrição, equipe e cobrança da taxa', async () => {
  const c = servidor.call;
  const ed = await prisma.geektopia.create({ data: { nome_edicao: 'ZZ EDICAO COMP', tipo_edicao: 'Pocket', status_evento: 'VendasEncerradas', classificacao_etaria: 0 } });
  const mk = (nome, mod, taxa) => prisma.competicao.create({ data: { id_geektopia: ed.id_geektopia, nome_competicao: nome, modalidade: mod, valor_taxa_inscricao: taxa } });
  const solo = await mk('ZZ Solo', 'Solo', 0); const dupla = await mk('ZZ Dupla', 'Dupla', 30); const grupo = await mk('ZZ Grupo', 'Grupo', null);
  const { u, H } = await criarUsuario('comp1');

  assert.equal((await c('POST', '/inscricoes', H, { id_competicao: solo.id_competicao })).s, 403, 'sem perfil de competidor');
  assert.equal((await c('POST', '/parceiros/competidor', H, { nickname_competidor: 'zzcomp' })).s, 201);

  const iSolo = await c('POST', '/inscricoes', H, { id_competicao: solo.id_competicao });
  assert.equal(iSolo.s, 201);
  assert.equal(iSolo.b.inscricao.status_inscricao, 'EmAnalise');

  assert.equal((await c('POST', '/inscricoes', H, { id_competicao: dupla.id_competicao })).s, 400, 'dupla sem equipe');
  assert.equal((await c('POST', '/inscricoes', H, { id_competicao: dupla.id_competicao, equipe: { nome_equipe: 'T', integrantes: 'Ana Souza\nBeto Lima' } })).s, 400, 'dupla com 2 parceiros');
  assert.equal((await c('POST', '/inscricoes', H, { id_competicao: grupo.id_competicao, equipe: { nome_equipe: 'G', integrantes: 'Ana Souza' } })).s, 400, 'grupo com 1 integrante');
  const iDupla = await c('POST', '/inscricoes', H, { id_competicao: dupla.id_competicao, equipe: { nome_equipe: 'Time ZZ', integrantes: 'Ana Souza' } });
  assert.equal(iDupla.s, 201);
  const id = iDupla.b.inscricao.id_inscricao;

  assert.equal((await c('POST', `/inscricoes/${id}/pagamento`, H)).s, 409, 'taxa só depois da aprovação');
  assert.equal((await c('PATCH', `/inscricoes/admin/${id}/status`, admin, { status_inscricao: 'Reprovado' })).s, 400, 'reprovar exige motivo');
  assert.equal((await c('PATCH', `/inscricoes/admin/${id}/status`, admin, { status_inscricao: 'Aprovado', observacao_admin: 'Ótimo!' })).s, 200);

  const pg = await c('POST', `/inscricoes/${id}/pagamento`, H);
  assert.equal(pg.s, 201);
  assert.equal((await c('POST', `/inscricoes/${id}/pagamento`, H)).b.id_pedido, pg.b.id_pedido, 'retoma o mesmo pedido');
  assert.equal((await c('POST', `/inscricoes/${iSolo.b.inscricao.id_inscricao}/pagamento`, H)).s, 409, 'competição sem taxa não cobra');
  assert.equal((await c('DELETE', `/inscricoes/${id}`, H)).s, 409, 'com pedido gerado não cancela');

  mp.pagamento = pagamentoAprovado(pg.b.id_pedido, 30);
  await fetch(`${servidor.base}/pedidos/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: mp.pagamento.id } }) });
  const minhas = await c('GET', '/inscricoes/minhas', H);
  assert.equal(minhas.b.find((i) => i.id_inscricao === id).pedido.status_pedido, 'Pago');
  assert.equal((await c('DELETE', `/inscricoes/${iSolo.b.inscricao.id_inscricao}`, H)).s, 200, 'inscrição em análise pode ser cancelada');
  assert.ok(u);
});
