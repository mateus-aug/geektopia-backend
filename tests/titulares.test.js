// INGRESSOS POR TITULAR: validações da compra, limites por pessoa, emissão, PDF, QR e check-in.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mp, prisma, iniciarServidor, cabecalho, CPFS, titular, criarUsuario, limparZZ, criarEdicaoComLotes, pagamentoAprovado } = require('./helpers/ambiente');

let servidor; let admin;
test.before(async () => {
  await limparZZ(); servidor = await iniciarServidor();
  const adm = await prisma.administrador.findFirst();
  admin = cabecalho(adm.id_usuario, true);
});
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

const ped = (H, itens) => servidor.call('POST', '/pedidos', H, { itens });
const webhook = (id) => fetch(`${servidor.base}/pedidos/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'payment', data: { id } }) });

test('validações dos titulares na compra', async () => {
  const { H } = await criarUsuario('tit1');
  const { lotes: [inteira, meia, lim2] } = await criarEdicaoComLotes([
    { nome_lote: 'ZZ Inteira', valor_ingresso: 50, quantidade_total: 100 },
    { nome_lote: 'ZZ Meia', valor_ingresso: 25, quantidade_total: 100, categoria: 'Meia' },
    { nome_lote: 'ZZ Lim2', valor_ingresso: 10, quantidade_total: 100, limite_por_pessoa: 2 }
  ], { classificacao_etaria: 14 });
  const T = (n = 'Ana Souza', c = CPFS[0], d = '1995-03-10') => titular(n, c, d);

  assert.equal((await ped(H, [{ id_lote: inteira.id_lote, quantidade: 1 }])).s, 400, 'sem titulares');
  assert.equal((await ped(H, [{ id_lote: inteira.id_lote, quantidade: 2, titulares: [T()] }])).s, 400, 'quantidade x titulares');
  assert.equal((await ped(H, [{ id_lote: inteira.id_lote, quantidade: 1, titulares: [T('Ana')] }])).s, 400, 'sem sobrenome');
  assert.equal((await ped(H, [{ id_lote: inteira.id_lote, quantidade: 1, titulares: [T('Ana Souza', '123')] }])).s, 400, 'CPF curto');
  assert.equal((await ped(H, [{ id_lote: inteira.id_lote, quantidade: 1, titulares: [T('Ana Souza', CPFS[0], '2035-01-01')] }])).s, 400, 'nascimento no futuro');
  const menor = await ped(H, [{ id_lote: inteira.id_lote, quantidade: 1, titulares: [T('Joao Menor', CPFS[1], '2015-06-01')] }]);
  assert.equal(menor.s, 400);
  assert.match(menor.b.error, /exige 14/);

  const duasMeias = await ped(H, [{ id_lote: meia.id_lote, quantidade: 2, titulares: [T(), T()] }]);
  assert.equal(duasMeias.s, 409, 'meia-entrada: 1 por pessoa');
  assert.equal((await ped(H, [{ id_lote: meia.id_lote, quantidade: 2, titulares: [T(), T('Beto Lima', CPFS[1], '1996-04-11')] }])).s, 201, 'meias para pessoas diferentes');
  assert.equal((await ped(H, [{ id_lote: lim2.id_lote, quantidade: 3, titulares: [T(), T(), T()] }])).s, 409, 'limite configurado (2)');
  const onze = Array.from({ length: 11 }, (_, i) => T(`Pessoa Numero ${i}`, CPFS[2]));
  assert.equal((await ped(H, [{ id_lote: inteira.id_lote, quantidade: 11, titulares: onze }])).s, 400, 'máximo 10 por compra');
});

test('emissão em nome dos titulares, PDF, mascaramento e check-in', async () => {
  const dono = await criarUsuario('tit2');
  const outro = await criarUsuario('tit3');
  const { lotes: [lote] } = await criarEdicaoComLotes([{ nome_lote: 'ZZ Emissao', valor_ingresso: 30, quantidade_total: 100 }], { classificacao_etaria: 14 });
  const r = await ped(dono.H, [{ id_lote: lote.id_lote, quantidade: 2, titulares: [titular('Ana Souza', CPFS[0]), titular('Beto Lima', CPFS[1], '1996-04-11')] }]);
  assert.equal(r.s, 201);
  mp.pagamento = pagamentoAprovado(r.b.id_pedido, 60);
  await webhook(mp.pagamento.id);

  const ings = await prisma.ingresso.findMany({ where: { id_usuario: dono.u.id_usuario }, orderBy: { id_ingresso: 'asc' } });
  assert.equal(ings.length, 2);
  assert.equal(ings[0].nome_titular, 'Ana Souza');
  assert.equal(ings[0].documento_titular, CPFS[0]);
  assert.equal(ings[0].idade_minima, 14);
  assert.ok(ings.every((i) => /^GT-[0-9a-f-]{36}$/.test(i.codigo_qr)));
  assert.equal(new Set(ings.map((i) => i.codigo_qr)).size, 2, 'QR codes únicos');

  const meus = await servidor.call('GET', '/ingressos/meus', dono.H);
  assert.ok(/\*\*\*/.test(meus.b[0].documento_titular), 'documento mascarado para o comprador');
  assert.ok(!JSON.stringify(meus.b).includes(CPFS[0]), 'CPF inteiro nunca sai na listagem do comprador');

  const pdf = await servidor.call('GET', `/ingressos/${ings[0].id_ingresso}/pdf`, dono.H);
  assert.equal(pdf.s, 200);
  assert.equal(pdf.b.subarray(0, 4).toString(), '%PDF');
  const pdfPedido = await servidor.call('GET', `/ingressos/pedido/${r.b.id_pedido}/pdf`, dono.H);
  assert.equal((pdfPedido.b.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 2, 'uma página por ingresso');
  assert.equal((await servidor.call('GET', `/ingressos/${ings[0].id_ingresso}/pdf`, outro.H)).s, 404, 'PDF de outra pessoa');

  assert.equal((await servidor.call('GET', '/ingressos/codigo/GT-inventado', admin)).s, 404, 'QR falso');
  assert.equal((await servidor.call('GET', `/ingressos/codigo/${ings[0].codigo_qr}`, dono.H)).s, 403, 'consulta por código é só do admin');
  const consulta = await servidor.call('GET', `/ingressos/codigo/${ings[0].codigo_qr}`, admin);
  assert.equal(consulta.b.ingresso.documento_titular, CPFS[0], 'a portaria vê o documento inteiro');
  assert.equal(consulta.b.ingresso.status_ingresso, 'Valido', 'consultar não dá baixa');

  const c1 = await servidor.call('PATCH', '/ingressos/checkin', admin, { codigo_qr: ings[0].codigo_qr });
  assert.equal(c1.s, 200);
  assert.equal(c1.b.ingresso.status_ingresso, 'Utilizado');
  const c2 = await servidor.call('PATCH', '/ingressos/checkin', admin, { codigo_qr: ings[0].codigo_qr });
  assert.equal(c2.s, 409, 'o mesmo QR não entra duas vezes');
  const dois = await Promise.all([1, 2, 3].map(() => servidor.call('PATCH', '/ingressos/checkin', admin, { codigo_qr: ings[1].codigo_qr })));
  assert.equal(dois.filter((x) => x.s === 200).length, 1, 'check-in simultâneo: só um passa');
});
