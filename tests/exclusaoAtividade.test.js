// EXCLUSÃO: quem tem QUALQUER atividade só pode ser inativado; só quem nunca fez nada pode ser excluído.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, iniciarServidor, cabecalho, criarUsuario, criarEdicaoComLotes, limparZZ, CPFS, titular } = require('./helpers/ambiente');

let servidor; let admin;
test.before(async () => { await limparZZ(); servidor = await iniciarServidor(); admin = cabecalho((await prisma.administrador.findFirst()).id_usuario, true); });
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

test('o admin não exclui quem tem atividade, a lista avisa, e quem não tem nada é excluído', async () => {
  const c = servidor.call;
  const { lotes: [lote] } = await criarEdicaoComLotes([{ nome_lote: 'ZZ L', valor_ingresso: 10, quantidade_total: 10 }]);

  const pedido = await criarUsuario('ea1');
  await c('POST', '/pedidos', pedido.H, { itens: [{ id_lote: lote.id_lote, quantidade: 1, titulares: [titular('Ana Souza', CPFS[0])] }] });
  const cortesia = await criarUsuario('ea2');
  await prisma.ingresso.create({ data: { id_usuario: cortesia.u.id_usuario, id_geektopia: lote.id_geektopia, id_lote: lote.id_lote, codigo_qr: 'GT-ZZ-EA2' } });
  const expositor = await criarUsuario('ea3');
  await c('POST', '/parceiros/expositor', expositor.H, { nome_loja_projeto: 'ZZ Loja', url_portfolio: 'https://x.com/zz' });
  const competidor = await criarUsuario('ea4');
  await c('POST', '/parceiros/competidor', competidor.H, { nickname_competidor: 'zzea4' });
  const evento = await criarUsuario('ea5');
  await c('POST', '/eventos-comunidade', evento.H, { nome_evento: 'ZZ Ev', data_evento: new Date(Date.now() + 5 * 864e5).toISOString(), local: 'X', descricao: 'x', url_saiba_mais: 'https://x.com' });
  const nada = await criarUsuario('ea6');

  for (const [nome, p] of [['pedido', pedido], ['ingresso', cortesia], ['perfil de expositor', expositor], ['perfil de competidor', competidor], ['evento da comunidade', evento]]) {
    const r = await c('DELETE', `/auth/admin/users/${p.u.id_usuario}`, admin);
    assert.equal(r.s, 409, `${nome}: não pode ser excluído`);
    assert.match(r.b.error, /Inativar/, `${nome}: a mensagem manda inativar`);
    assert.equal(await prisma.usuario.count({ where: { id_usuario: p.u.id_usuario } }), 1, `${nome}: continua no banco`);
  }

  const lista = (await c('GET', '/auth/admin/users?q=zz.ea', admin)).b.itens;
  const atividade = Object.fromEntries(lista.map((u) => [u.email, u.tem_atividade]));
  for (const n of [1, 2, 3, 4, 5]) assert.equal(atividade[`zz.ea${n}@teste.local`], true, `ea${n} aparece com atividade`);
  assert.equal(atividade['zz.ea6@teste.local'], false, 'quem não tem nada aparece sem atividade');

  assert.equal((await c('DELETE', `/auth/admin/users/${nada.u.id_usuario}`, admin)).s, 200, 'sem atividade: excluído');
  assert.equal((await c('PATCH', `/auth/admin/users/${expositor.u.id_usuario}/inativar`, admin, {})).s, 200, 'com atividade: pode inativar');
});

test('encerrar a própria conta: perfil de competidor também conta como atividade (inativa, não apaga)', async () => {
  const { u, H } = await criarUsuario('ea7');
  await servidor.call('POST', '/parceiros/competidor', H, { nickname_competidor: 'zzea7' });
  const r = await servidor.call('DELETE', '/auth/delete-account', H, { senha: 'x' });
  assert.equal(r.s, 200); assert.equal(r.b.inativada, true);
  assert.equal(await prisma.usuario.count({ where: { id_usuario: u.id_usuario } }), 1);
});
