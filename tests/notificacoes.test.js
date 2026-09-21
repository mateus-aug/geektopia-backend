// NOTIFICAÇÕES: avisos ao participante e ao admin nos momentos certos, sempre só para quem é o dono.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mp, prisma, iniciarServidor, cabecalho, CPFS, titular, criarUsuario, limparZZ, criarEdicaoComLotes, pagamentoAprovado } = require('./helpers/ambiente');

let servidor; let admin; let idAdmin;
test.before(async () => {
  await limparZZ(); servidor = await iniciarServidor();
  idAdmin = (await prisma.administrador.findFirst()).id_usuario;
  admin = cabecalho(idAdmin, true);
});
test.after(async () => {
  await prisma.notificacao.deleteMany({ where: { OR: [{ titulo: { contains: 'ZZ' } }, { texto: { contains: 'ZZ' } }] } });
  await limparZZ(); await servidor.fechar(); await prisma.$disconnect();
});
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const minhas = async (H) => (await servidor.call('GET', '/notificacoes', H)).b;

test('pagamento confirmado avisa o comprador; ler e marcar como lida; ninguém lê a de outro', async () => {
  const a = await criarUsuario('not1');
  const b = await criarUsuario('not2');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote Not', valor_ingresso: 20, quantidade_total: 20 }]);
  const r = await servidor.call('POST', '/pedidos', a.H, { itens: [{ id_lote: lotes[0].id_lote, quantidade: 1, titulares: [titular('Ana Souza', CPFS[0])] }] });
  mp.pagamento = pagamentoAprovado(r.b.id_pedido, 20);
  await fetch(`${servidor.base}/pedidos/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: mp.pagamento.id } }) });
  await esperar(400);

  const lista = await minhas(a.H);
  assert.equal(lista.nao_lidas, 1);
  assert.equal(lista.itens[0].tipo, 'ingresso_emitido');
  assert.equal((await minhas(b.H)).itens.length, 0, 'o outro usuário não recebe');

  const id = lista.itens[0].id_notificacao;
  assert.equal((await servidor.call('PATCH', `/notificacoes/${id}/lida`, b.H)).s, 404, 'não marca a notificação de outra pessoa');
  assert.equal((await servidor.call('PATCH', `/notificacoes/${id}/lida`, a.H)).s, 200);
  assert.equal((await minhas(a.H)).nao_lidas, 0);
  assert.equal((await servidor.call('GET', '/notificacoes', { 'Content-Type': 'application/json' })).s, 401, 'exige login');

  // Reenvio do webhook não gera outro aviso.
  await fetch(`${servidor.base}/pedidos/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: mp.pagamento.id } }) });
  await esperar(300);
  assert.equal((await minhas(a.H)).itens.length, 1);
});

test('valor divergente avisa os administradores (alerta financeiro)', async () => {
  const a = await criarUsuario('not3');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote Alerta', valor_ingresso: 100, quantidade_total: 20 }]);
  const r = await servidor.call('POST', '/pedidos', a.H, { itens: [{ id_lote: lotes[0].id_lote, quantidade: 1, titulares: [titular('Ana Souza', CPFS[0])] }] });
  const antes = (await minhas(admin)).nao_lidas;
  mp.pagamento = pagamentoAprovado(r.b.id_pedido, 5);
  await fetch(`${servidor.base}/pedidos/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id: mp.pagamento.id } }) });
  await esperar(500);
  const depois = await minhas(admin);
  assert.ok(depois.nao_lidas > antes, 'o admin foi avisado');
  assert.equal(depois.itens[0].tipo, 'alerta_financeiro');
  await prisma.notificacao.deleteMany({ where: { tipo: 'alerta_financeiro', texto: { contains: `#${r.b.id_pedido}` } } });
});

test('decisão do admin sobre o pedido de espaço avisa o expositor (e o pedido novo avisa o admin)', async () => {
  const ed = await prisma.geektopia.create({ data: { nome_edicao: 'ZZ EDICAO NOT', tipo_edicao: 'Pocket', status_evento: 'VendasEncerradas', classificacao_etaria: 0 } });
  const esp = (await servidor.call('POST', '/espacos', admin, { id_geektopia: ed.id_geektopia, tipo_espaco: 'ZZ Mesa', valor_base: 50 })).b.espaco;
  const u = await criarUsuario('not4');
  await servidor.call('POST', '/parceiros/expositor', u.H, { nome_loja_projeto: 'ZZ Loja Not' });
  const sol = (await servidor.call('POST', '/solicitacoes-espaco', u.H, { id_geektopia: ed.id_geektopia, id_espaco: esp.id_espaco })).b.solicitacao;
  await esperar(400);
  const paraAdmin = (await minhas(admin)).itens.find((n) => n.tipo === 'solicitacao_nova' && /ZZ Loja Not/.test(n.texto));
  assert.ok(paraAdmin, 'o admin recebeu o aviso do pedido novo');

  await servidor.call('PATCH', `/solicitacoes-espaco/${sol.id_solicitacao}/status`, admin, { status_solicitacao: 'Aprovado' });
  await esperar(400);
  const n = (await minhas(u.H)).itens[0];
  assert.equal(n.tipo, 'solicitacao_aprovada');
  assert.equal(n.link, `/expositor/solicitacoes/${sol.id_solicitacao}`);
  await prisma.notificacao.deleteMany({ where: { texto: { contains: 'ZZ Loja Not' } } });
});
