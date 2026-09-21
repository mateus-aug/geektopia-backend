// EXPOSITOR: espaços por edição, solicitação, congelamento de preço, ajudantes e cobrança retomável.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mp, prisma, iniciarServidor, cabecalho, criarUsuario, limparZZ, pagamentoAprovado } = require('./helpers/ambiente');

let servidor; let admin;
test.before(async () => {
  await limparZZ(); servidor = await iniciarServidor();
  const adm = await prisma.administrador.findFirst();
  admin = cabecalho(adm.id_usuario, true);
});
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

const criarEdicao = async (nome) => (await prisma.geektopia.create({ data: { nome_edicao: nome, tipo_edicao: 'Pocket', status_evento: 'VendasEncerradas', classificacao_etaria: 0 } })).id_geektopia;

test('espaço pertence a uma edição e a solicitação respeita isso', async () => {
  const ed1 = await criarEdicao('ZZ EDICAO EXPO 1');
  const ed2 = await criarEdicao('ZZ EDICAO EXPO 2');
  const { H } = await criarUsuario('exp1');
  const c = servidor.call;

  assert.equal((await c('POST', '/espacos', admin, { tipo_espaco: 'ZZ sem edicao', valor_base: 10 })).s, 400, 'espaço exige edição');
  const esp = (await c('POST', '/espacos', admin, { id_geektopia: ed1, tipo_espaco: 'ZZ Barraca', valor_base: 100, valor_taxa_ajudante: 10, valor_taxa_mesa_extra: 20, valor_taxa_cadeira_extra: 5, qtd_mesas: 1, quantidade_cadeiras: 2 })).b.espaco;
  assert.equal((await c('GET', `/espacos?id_geektopia=${ed1}`, H)).b.length, 1);
  assert.equal((await c('GET', `/espacos?id_geektopia=${ed2}`, H)).b.length, 0, 'outra edição não enxerga');

  assert.equal((await c('POST', '/solicitacoes-espaco', H, { id_geektopia: ed1, id_espaco: esp.id_espaco })).s, 403, 'sem perfil de expositor');
  assert.equal((await c('POST', '/parceiros/expositor', H, { nome_loja_projeto: 'ZZ Loja', url_portfolio: 'https://instagram.com/zz' })).s, 201);
  const errada = await c('POST', '/solicitacoes-espaco', H, { id_geektopia: ed2, id_espaco: esp.id_espaco });
  assert.equal(errada.s, 400);
  assert.match(errada.b.error, /não pertence/);

  const sol = await c('POST', '/solicitacoes-espaco', H, { id_geektopia: ed1, id_espaco: esp.id_espaco, qtd_ajudantes_extras: 2, qtd_mesas_extras: 1, qtd_cadeiras_extras: 3 });
  assert.equal(sol.s, 201);
  assert.equal(sol.b.solicitacao.valor_total_final, 155, '100 + 2x10 + 1x20 + 3x5');
  assert.equal((await c('POST', '/solicitacoes-espaco', H, { id_geektopia: ed1, id_espaco: esp.id_espaco })).s, 409, 'uma candidatura aberta por edição');

  await c('PUT', `/espacos/${esp.id_espaco}`, admin, { valor_base: 500 });
  assert.equal((await c('GET', `/solicitacoes-espaco/${sol.b.solicitacao.id_solicitacao}`, H)).b.valor_total_final, 155, 'preço congelado');
});

test('cobrança da taxa: só após aprovação, retomável, sem duplicar, confirmada por pagamento aprovado', async () => {
  const ed = await criarEdicao('ZZ EDICAO EXPO 3');
  const { u, H } = await criarUsuario('exp2');
  const c = servidor.call;
  const esp = (await c('POST', '/espacos', admin, { id_geektopia: ed, tipo_espaco: 'ZZ Mesa', valor_base: 100 })).b.espaco;
  await c('POST', '/parceiros/expositor', H, { nome_loja_projeto: 'ZZ Loja 2', url_portfolio: 'https://instagram.com/zz' });
  const sol = (await c('POST', '/solicitacoes-espaco', H, { id_geektopia: ed, id_espaco: esp.id_espaco })).b.solicitacao;
  const id = sol.id_solicitacao;

  assert.equal((await c('POST', `/solicitacoes-espaco/${id}/pagamento`, H)).s, 409, 'antes da aprovação não cobra');
  assert.equal((await c('PATCH', `/solicitacoes-espaco/${id}/status`, admin, { status_solicitacao: 'Aprovado' })).s, 200);

  // Duplo clique: duas cobranças ao mesmo tempo geram UM pedido só.
  const antes = await prisma.pedido.count({ where: { id_usuario: u.id_usuario } });
  const [p1, p2] = await Promise.all([c('POST', `/solicitacoes-espaco/${id}/pagamento`, H), c('POST', `/solicitacoes-espaco/${id}/pagamento`, H)]);
  assert.ok([p1.s, p2.s].includes(201));
  assert.equal(await prisma.pedido.count({ where: { id_usuario: u.id_usuario } }), antes + 1, 'um único pedido');

  const p3 = await c('POST', `/solicitacoes-espaco/${id}/pagamento`, H);
  assert.equal(p3.s, 201);
  assert.match(p3.b.message, /retomado/i, 'reabrir o link retoma o mesmo pedido');
  assert.equal(await prisma.pedido.count({ where: { id_usuario: u.id_usuario } }), antes + 1);

  // Ainda não aparece como confirmado.
  assert.equal((await c('GET', `/geektopia/${ed}/expositores-confirmados`)).b.length, 0);

  const idPedido = p3.b.id_pedido;
  mp.pagamento = pagamentoAprovado(idPedido, 100);
  await fetch(`${servidor.base}/pedidos/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: mp.pagamento.id } }) });
  assert.equal((await prisma.pedido.findUnique({ where: { id_pedido: idPedido } })).status_pedido, 'Pago');
  assert.equal((await c('POST', `/solicitacoes-espaco/${id}/pagamento`, H)).s, 409, 'já paga: não cobra de novo');
  assert.equal((await c('GET', `/geektopia/${ed}/expositores-confirmados`)).b.length, 1, 'aprovado + pago aparece no site');

  // Pagamento de valor errado NÃO confirma a taxa.
  const { u: u2, H: H2 } = await criarUsuario('exp3');
  await c('POST', '/parceiros/expositor', H2, { nome_loja_projeto: 'ZZ Loja 3', url_portfolio: 'https://instagram.com/zz' });
  const s2 = (await c('POST', '/solicitacoes-espaco', H2, { id_geektopia: ed, id_espaco: esp.id_espaco })).b.solicitacao;
  await c('PATCH', `/solicitacoes-espaco/${s2.id_solicitacao}/status`, admin, { status_solicitacao: 'Aprovado' });
  const pg = (await c('POST', `/solicitacoes-espaco/${s2.id_solicitacao}/pagamento`, H2)).b;
  mp.pagamento = pagamentoAprovado(pg.id_pedido, 1);
  await fetch(`${servidor.base}/pedidos/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: mp.pagamento.id } }) });
  assert.equal((await prisma.pedido.findUnique({ where: { id_pedido: pg.id_pedido } })).status_pedido, 'Pendente');
  assert.ok(u2);
});
