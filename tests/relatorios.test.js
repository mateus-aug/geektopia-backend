// RELATÓRIOS: agregações (puras) e o endpoint do painel (só admin, filtros, sem dados pessoais).
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/services/relatorios');
const { prisma, iniciarServidor, cabecalho, criarUsuario, criarEdicaoComLotes, limparZZ, CPFS } = require('./helpers/ambiente');

test('cidades com grafias diferentes viram uma só; faixa etária e CSV seguro', () => {
  const d = R.demografia([
    { cidade: 'ponta grossa', estado: 'pr', genero: 'Feminino', idade: 20 },
    { cidade: 'Ponta  Grossa', estado: 'PR', genero: 'feminino', idade: 30 },
    { cidade: 'Curitiba', estado: 'PR', genero: null, idade: null }
  ]);
  assert.equal(d.por_cidade[0].rotulo, 'Ponta Grossa - PR');
  assert.equal(d.por_cidade[0].quantidade, 2);
  assert.equal(d.por_genero.find((g) => g.rotulo === 'Feminino').quantidade, 2);
  const herdado = R.demografia([{ cidade: 'Ponta Grossa', estado: null }, { cidade: 'Ponta Grossa', estado: 'PR' }, { cidade: 'Castro', estado: null }]);
  assert.equal(herdado.por_cidade[0].quantidade, 2, 'estado faltando herda o da mesma cidade');
  assert.equal(herdado.por_estado.find((e) => e.rotulo === 'PR').quantidade, 2);
  assert.equal(R.faixaDaIdade(17), '12 a 17');
  assert.equal(R.faixaDaIdade(null), 'Não informada');
  assert.equal(R.idadeEm('2000-01-01', new Date('2026-06-01T00:00:00Z')), 26);
  const csv = R.paraCsv(['a', 'b'], [['=CMD()', 2.5], ['x;y', 'ok']]);
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv, /'=CMD\(\);2,5/);
  assert.match(csv, /"x;y";ok/);
  assert.deepEqual(R.vendasPorDia([{ data: '2026-05-01T15:00:00Z', valor: 10 }, { data: '2026-05-03T15:00:00Z', valor: 5 }]).map((x) => x.ingressos), [1, 0, 1]);
});

let servidor; let admin;
test.before(async () => { await limparZZ(); servidor = await iniciarServidor(); admin = cabecalho((await prisma.administrador.findFirst()).id_usuario, true); });
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

test('painel: só admin, filtros por cidade/edição e nenhum dado pessoal', async () => {
  const { g, lotes } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Lote', valor_ingresso: 50, quantidade_total: 10 }]);
  const a = await criarUsuario('rel1', { cidade: 'Castro', estado: 'PR', genero: 'Feminino' });
  const b = await criarUsuario('rel2', { cidade: 'Curitiba', estado: 'PR', genero: 'Masculino' });
  const item = async (u, valor) => {
    const ped = await prisma.pedido.create({ data: { id_usuario: u.id_usuario, valor_total_bruto: valor, status_pedido: 'Pago' } });
    const it = await prisma.item_Pedido.create({ data: { id_pedido: ped.id_pedido, id_lote: lotes[0].id_lote, quantidade: 1, preco_unitario_momento: valor, subtotal: valor } });
    return prisma.ingresso.create({ data: { id_usuario: u.id_usuario, id_geektopia: g.id_geektopia, id_lote: lotes[0].id_lote, id_item: it.id_item, codigo_qr: `GT-ZZREL-${u.id_usuario}`, nome_titular: 'ZZ Titular', documento_titular: CPFS[0], data_nascimento_titular: new Date('2000-05-05') } });
  };
  await item(a.u, 50); const ib = await item(b.u, 50);
  await prisma.ingresso.update({ where: { id_ingresso: ib.id_ingresso }, data: { status_ingresso: 'Utilizado', data_checkin: new Date() } });

  assert.equal((await servidor.call('GET', '/relatorios/painel', a.H)).s, 403, 'usuário comum não vê');
  assert.equal((await servidor.call('GET', '/relatorios/painel')).s, 401);

  const todos = (await servidor.call('GET', `/relatorios/painel?id_geektopia=${g.id_geektopia}`, admin)).b;
  assert.equal(todos.resumo.ingressos_vendidos, 2);
  assert.equal(todos.resumo.receita_ingressos, 100);
  assert.equal(todos.resumo.checkins, 1);
  assert.equal(todos.resumo.ticket_medio, 50);
  assert.equal(todos.resumo.cortesias, 0);
  assert.equal(todos.resumo.taxa_comparecimento, 50);
  assert.ok(todos.publico.por_cidade.some((c) => c.rotulo === 'Castro - PR'));

  const castro = (await servidor.call('GET', `/relatorios/painel?id_geektopia=${g.id_geektopia}&cidade=castro`, admin)).b;
  assert.equal(castro.resumo.ingressos_vendidos, 1, 'filtro de cidade ignora maiúsculas');
  const fem = (await servidor.call('GET', `/relatorios/painel?id_geektopia=${g.id_geektopia}&genero=Masculino`, admin)).b;
  assert.equal(fem.resumo.ingressos_vendidos, 1);
  const futuro = (await servidor.call('GET', `/relatorios/painel?id_geektopia=${g.id_geektopia}&de=2999-01-01`, admin)).b;
  assert.equal(futuro.resumo.ingressos_vendidos, 0);

  const texto = JSON.stringify(todos);
  for (const proibido of [CPFS[0], 'zz.rel1@teste.local', 'ZZ Titular']) assert.ok(!texto.includes(proibido), `não pode vazar ${proibido}`);
  assert.equal((await servidor.call('GET', '/relatorios/painel?id_geektopia=abc', admin)).s, 400);
});
