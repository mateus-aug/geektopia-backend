// PAGAMENTO — o teste mais importante do projeto (dinheiro). Tudo com Mercado Pago SIMULADO.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { mp, prisma, iniciarServidor, cabecalho, CPFS, titular, criarUsuario, limparZZ, criarEdicaoComLotes, pagamentoAprovado } = require('./helpers/ambiente');

let servidor;
test.before(async () => { await limparZZ(); servidor = await iniciarServidor(); });
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

const webhook = (idPagamento, cabecalhos = {}) => fetch(`${servidor.base}/pedidos/webhook`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...cabecalhos }, body: JSON.stringify({ type: 'payment', data: { id: idPagamento } })
});
const ingressosDo = (idUsuario) => prisma.ingresso.count({ where: { id_usuario: idUsuario } });

async function comprar(H, lote, quantidade) {
  const titulares = Array.from({ length: quantidade }, (_, i) => titular(`Pessoa Numero ${i + 1}`, CPFS[i % CPFS.length]));
  return servidor.call('POST', '/pedidos', H, { itens: [{ id_lote: lote.id_lote, quantidade, titulares }] });
}

test('a simulação do Mercado Pago está ativa (nenhuma cobrança real)', async () => {
  const antes = mp.chamadas;
  const { H } = await criarUsuario('pag0');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 0', valor_ingresso: 40, quantidade_total: 50 }]);
  const r = await comprar(H, lotes[0], 1);
  assert.equal(r.s, 201);
  assert.match(r.b.init_point, /^https:\/\/mp\.simulado\//);
  assert.equal(mp.chamadas, antes + 1);
});

test('pagamento aprovado com o valor certo emite os ingressos, uma vez só', async () => {
  const { u, H } = await criarUsuario('pag1');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 1', valor_ingresso: 40, quantidade_total: 50 }]);
  const r = await comprar(H, lotes[0], 2);
  const idPedido = r.b.id_pedido;

  mp.pagamento = pagamentoAprovado(idPedido, 80);
  assert.equal((await webhook(mp.pagamento.id)).status, 200);
  assert.equal(await ingressosDo(u.id_usuario), 2);
  const pedido = await prisma.pedido.findUnique({ where: { id_pedido: idPedido }, include: { pagamento: true } });
  assert.equal(pedido.status_pedido, 'Pago');
  assert.equal(pedido.pagamento.status_pagamento, 'Aprovado');
  assert.equal(pedido.pagamento.codigo_transacao, String(mp.pagamento.id));

  // O Mercado Pago reenvia a notificação (acontece): nada muda.
  await webhook(mp.pagamento.id);
  await webhook(mp.pagamento.id);
  assert.equal(await ingressosDo(u.id_usuario), 2, 'webhook repetido não pode gerar ingresso duplicado');
});

test('webhook e sincronização ao MESMO tempo não duplicam ingressos (corrida)', async () => {
  const { u, H } = await criarUsuario('pag2');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 2', valor_ingresso: 30, quantidade_total: 50 }]);
  const r = await comprar(H, lotes[0], 3);
  mp.pagamento = pagamentoAprovado(r.b.id_pedido, 90);
  mp.pagamentos = [mp.pagamento];

  await Promise.all([
    webhook(mp.pagamento.id), webhook(mp.pagamento.id), webhook(mp.pagamento.id),
    servidor.call('GET', `/pedidos/${r.b.id_pedido}/sincronizar`, H), servidor.call('GET', `/pedidos/${r.b.id_pedido}/sincronizar`, H)
  ]);
  assert.equal(await ingressosDo(u.id_usuario), 3, 'exatamente a quantidade comprada');
});

test('valor pago DIFERENTE do pedido: nada é emitido', async () => {
  const { u, H } = await criarUsuario('pag3');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 3', valor_ingresso: 100, quantidade_total: 50 }]);
  const r = await comprar(H, lotes[0], 1);
  mp.pagamento = pagamentoAprovado(r.b.id_pedido, 1); // pagou R$ 1 num ingresso de R$ 100
  await webhook(mp.pagamento.id);
  assert.equal(await ingressosDo(u.id_usuario), 0);
  const ped = await prisma.pedido.findUnique({ where: { id_pedido: r.b.id_pedido } });
  assert.equal(ped.status_pedido, 'Pendente');
});

test('pagamento que NÃO está approved não emite (pendente, recusado, estornado)', async () => {
  const { u, H } = await criarUsuario('pag4');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 4', valor_ingresso: 20, quantidade_total: 50 }]);
  const r = await comprar(H, lotes[0], 1);
  for (const status of ['pending', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back']) {
    mp.pagamento = pagamentoAprovado(r.b.id_pedido, 20, { status });
    await webhook(mp.pagamento.id);
  }
  assert.equal(await ingressosDo(u.id_usuario), 0);
});

test('pagamento de pedido CANCELADO não emite ingresso', async () => {
  const { u, H } = await criarUsuario('pag5');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 5', valor_ingresso: 20, quantidade_total: 50 }]);
  const r = await comprar(H, lotes[0], 1);
  await prisma.pedido.update({ where: { id_pedido: r.b.id_pedido }, data: { status_pedido: 'Cancelado' } });
  mp.pagamento = pagamentoAprovado(r.b.id_pedido, 20);
  await webhook(mp.pagamento.id);
  assert.equal(await ingressosDo(u.id_usuario), 0);
});

test('estoque acaba antes da emissão: não vende além do lote', async () => {
  const a = await criarUsuario('pag6a');
  const b = await criarUsuario('pag6b');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 6', valor_ingresso: 20, quantidade_total: 1 }]);
  const ra = await comprar(a.H, lotes[0], 1);
  const rb = await comprar(b.H, lotes[0], 1); // os dois pedidos passam (pedido pendente ainda não reserva)
  assert.equal(ra.s, 201);
  assert.equal(rb.s, 201);

  mp.pagamento = pagamentoAprovado(ra.b.id_pedido, 20);
  await webhook(mp.pagamento.id);
  mp.pagamento = pagamentoAprovado(rb.b.id_pedido, 20);
  await webhook(mp.pagamento.id);

  const total = await prisma.ingresso.count({ where: { id_lote: lotes[0].id_lote } });
  assert.equal(total, 1, 'o lote tem 1 ingresso e só 1 pode existir');
  const pedB = await prisma.pedido.findUnique({ where: { id_pedido: rb.b.id_pedido } });
  assert.equal(pedB.status_pedido, 'Pendente', 'o segundo pedido não vira Pago sem ingresso');
});

test('falha no meio da emissão desfaz TUDO (transação)', async () => {
  const { u, H } = await criarUsuario('pag7');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 7', valor_ingresso: 20, quantidade_total: 50 }]);
  const r = await comprar(H, lotes[0], 2);
  // Estraga o 2º titular direto no banco: a criação do 2º ingresso vai falhar depois de o 1º ter sido criado.
  const item = await prisma.item_Pedido.findFirst({ where: { id_pedido: r.b.id_pedido } });
  const ts = item.titulares; ts[1].data_nascimento = 'lixo';
  await prisma.item_Pedido.update({ where: { id_item: item.id_item }, data: { titulares: ts } });

  mp.pagamento = pagamentoAprovado(r.b.id_pedido, 40);
  const resp = await webhook(mp.pagamento.id);
  assert.equal(resp.status, 500, 'erro inesperado: o Mercado Pago tenta de novo depois');
  assert.equal(await ingressosDo(u.id_usuario), 0, 'nenhum ingresso pela metade');
  const ped = await prisma.pedido.findUnique({ where: { id_pedido: r.b.id_pedido }, include: { pagamento: true } });
  assert.equal(ped.status_pedido, 'Pendente');
  assert.equal(ped.pagamento.status_pagamento, 'Pendente');
});

test('sincronização escolhe a tentativa APROVADA entre várias', async () => {
  const { u, H } = await criarUsuario('pag8');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 8', valor_ingresso: 25, quantidade_total: 50 }]);
  const r = await comprar(H, lotes[0], 1);
  mp.pagamentos = [pagamentoAprovado(r.b.id_pedido, 25, { status: 'rejected', id: 1 }), pagamentoAprovado(r.b.id_pedido, 25, { id: 2 })];
  const s = await servidor.call('GET', `/pedidos/${r.b.id_pedido}/sincronizar`, H);
  assert.equal(s.s, 200);
  assert.equal(s.b.status_pedido, 'Pago');
  assert.equal(await ingressosDo(u.id_usuario), 1);
});

test('pedido de OUTRA pessoa não pode ser sincronizado nem lido', async () => {
  const a = await criarUsuario('pag9a');
  const b = await criarUsuario('pag9b');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 9', valor_ingresso: 25, quantidade_total: 50 }]);
  const r = await comprar(a.H, lotes[0], 1);
  assert.equal((await servidor.call('GET', `/pedidos/${r.b.id_pedido}/sincronizar`, b.H)).s, 403);
  assert.equal((await servidor.call('GET', `/pedidos/${r.b.id_pedido}`, b.H)).s, 403);
});

test('preço vem SEMPRE do banco (o cliente não escolhe o valor)', async () => {
  const { H } = await criarUsuario('pag10');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 10', valor_ingresso: 60, quantidade_total: 50 }]);
  const r = await servidor.call('POST', '/pedidos', H, { itens: [{ id_lote: lotes[0].id_lote, quantidade: 1, preco_unitario: 0.01, valor: 0.01, titulares: [titular('Pessoa Numero 1', CPFS[0])] }] });
  assert.equal(r.s, 201);
  const ped = await prisma.pedido.findUnique({ where: { id_pedido: r.b.id_pedido } });
  assert.equal(Number(ped.valor_total_bruto), 60);
});

test('assinatura do webhook: recusa falsa e aceita a verdadeira (quando há segredo)', async () => {
  const { u, H } = await criarUsuario('pag11');
  const { lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote 11', valor_ingresso: 25, quantidade_total: 50 }]);
  const r = await comprar(H, lotes[0], 1);
  mp.pagamento = pagamentoAprovado(r.b.id_pedido, 25);
  process.env.MP_WEBHOOK_SECRET = 'segredo-de-teste';
  try {
    assert.equal((await webhook(mp.pagamento.id)).status, 401, 'sem assinatura');
    assert.equal((await webhook(mp.pagamento.id, { 'x-signature': 'ts=1,v1=00', 'x-request-id': 'r1' })).status, 401, 'assinatura falsa');
    assert.equal(await ingressosDo(u.id_usuario), 0);

    const ts = String(Date.now());
    const manifesto = `id:${mp.pagamento.id};request-id:req-1;ts:${ts};`;
    const v1 = crypto.createHmac('sha256', 'segredo-de-teste').update(manifesto).digest('hex');
    assert.equal((await webhook(mp.pagamento.id, { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' })).status, 200);
    assert.equal(await ingressosDo(u.id_usuario), 1);
  } finally {
    delete process.env.MP_WEBHOOK_SECRET;
  }
});
