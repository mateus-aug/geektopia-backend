// EVENTOS DA COMUNIDADE: envio, análise, publicação e permissões.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, iniciarServidor, cabecalho, criarUsuario, limparZZ } = require('./helpers/ambiente');

let servidor; let admin;
test.before(async () => {
  await limparZZ(); servidor = await iniciarServidor();
  admin = cabecalho((await prisma.administrador.findFirst()).id_usuario, true);
});
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

const amanha = () => new Date(Date.now() + 5 * 86400000).toISOString();
const corpo = (extra = {}) => ({ nome_evento: 'ZZ Festival Anime', data_evento: amanha(), local: 'Ginásio', descricao: 'Evento de teste', url_saiba_mais: 'https://exemplo.com', ...extra });

test('validações do envio', async () => {
  const { H } = await criarUsuario('com1'); const c = servidor.call;
  assert.equal((await c('POST', '/eventos-comunidade', {}, corpo())).s, 401, 'exige login');
  for (const ruim of [{ nome_evento: '' }, { data_evento: '0000-01-01' }, { data_evento: '131323-05-05' }, { data_evento: '2020-01-01' }, { local: '' }, { descricao: '' }, { url_saiba_mais: 'javascript:alert(1)' }, { data_fim: '2001-01-01' }]) {
    assert.equal((await c('POST', '/eventos-comunidade', H, corpo(ruim))).s, 400, JSON.stringify(ruim));
  }
  assert.equal((await c('POST', '/eventos-comunidade', H, corpo())).s, 201);
});

test('fluxo: enviar → não aparece → aprovar → não aparece → publicar → aparece → recusar tira', async () => {
  const { u, H } = await criarUsuario('com2'); const c = servidor.call;
  const ev = (await c('POST', '/eventos-comunidade', H, corpo({ nome_evento: 'ZZ Evento Fluxo' }))).b.evento;
  const noPublico = async () => (await c('GET', '/eventos-comunidade', {})).b.some((e) => e.id_evento_externo === ev.id_evento_externo);

  assert.equal(await noPublico(), false, 'em análise não é público');
  assert.equal((await c('PATCH', `/eventos-comunidade/admin/${ev.id_evento_externo}/status`, H, { status: 'Aprovado' })).s, 403, 'usuário comum não aprova');
  assert.equal((await c('PATCH', `/eventos-comunidade/admin/${ev.id_evento_externo}/publicar`, admin, { publicado: true })).s, 409, 'não publica sem aprovar');
  assert.equal((await c('PATCH', `/eventos-comunidade/admin/${ev.id_evento_externo}/status`, admin, { status: 'Reprovado' })).s, 400, 'recusa exige motivo');

  assert.equal((await c('PATCH', `/eventos-comunidade/admin/${ev.id_evento_externo}/status`, admin, { status: 'Aprovado' })).s, 200);
  assert.equal(await noPublico(), false, 'aprovado ainda não é público');
  assert.equal((await c('PATCH', `/eventos-comunidade/admin/${ev.id_evento_externo}/publicar`, admin, { publicado: true })).s, 200);
  assert.equal(await noPublico(), true);
  assert.equal((await c('DELETE', `/eventos-comunidade/${ev.id_evento_externo}`, H)).s, 409, 'publicado: dono não apaga');

  await c('PATCH', `/eventos-comunidade/admin/${ev.id_evento_externo}/status`, admin, { status: 'Reprovado', motivo: 'Fora do tema' });
  assert.equal(await noPublico(), false, 'recusar tira do ar');
  const meus = (await c('GET', '/eventos-comunidade/meus', H)).b;
  assert.equal(meus[0].motivo_recusa, 'Fora do tema');
  const avisos = await prisma.notificacao.findMany({ where: { id_usuario: u.id_usuario, tipo: 'evento_comunidade' } });
  assert.ok(avisos.length >= 2, 'organizador é avisado das decisões');

  const ed = await c('PUT', `/eventos-comunidade/${ev.id_evento_externo}`, H, corpo({ nome_evento: 'ZZ Evento Corrigido' }));
  assert.equal(ed.b.evento.status_aprovacao, 'EmAnalise', 'editar volta para análise');
});

test('isolamento e limite de pedidos abertos', async () => {
  const a = await criarUsuario('com3'); const b = await criarUsuario('com4'); const c = servidor.call;
  const ev = (await c('POST', '/eventos-comunidade', a.H, corpo({ nome_evento: 'ZZ Do A' }))).b.evento;
  assert.equal((await c('PUT', `/eventos-comunidade/${ev.id_evento_externo}`, b.H, corpo())).s, 404, 'B não edita o de A');
  assert.equal((await c('DELETE', `/eventos-comunidade/${ev.id_evento_externo}`, b.H)).s, 404);
  assert.equal((await c('GET', '/eventos-comunidade/meus', b.H)).b.length, 0);
  for (let i = 0; i < 4; i++) await c('POST', '/eventos-comunidade', a.H, corpo());
  assert.equal((await c('POST', '/eventos-comunidade', a.H, corpo())).s, 429, 'máx. 5 em análise');
  assert.equal((await c('DELETE', `/eventos-comunidade/${ev.id_evento_externo}`, a.H)).s, 200, 'dono retira o pedido');
});
