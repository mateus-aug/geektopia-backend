// PÁGINA GEEKTOPIA: carrossel e textos gerais são do site, não de uma edição.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, iniciarServidor, cabecalho, criarUsuario, limparZZ } = require('./helpers/ambiente');

let servidor; let admin; let textoOriginal;
test.before(async () => {
  await limparZZ(); servidor = await iniciarServidor();
  admin = cabecalho((await prisma.administrador.findFirst()).id_usuario, true);
  textoOriginal = await prisma.conteudo_Site.findUnique({ where: { chave: 'geektopia' } });
});
test.after(async () => {
  await prisma.conteudo_Site.deleteMany({ where: { chave: 'geektopia' } });
  if (textoOriginal) await prisma.conteudo_Site.create({ data: textoOriginal });
  await prisma.foto_Site.deleteMany({ where: { legenda: { startsWith: 'ZZ' } } });
  await limparZZ(); await servidor.fechar(); await prisma.$disconnect();
});

test('textos gerais: padrão, edição só por admin, validação e restauração', async () => {
  const { H } = await criarUsuario('pg1'); const c = servidor.call;
  const base = (await c('GET', '/conteudo/geektopia', {})).b;
  assert.ok(base.sobre.titulo && base.galeria.titulo && base.participar.titulo, 'nunca vem vazio');
  const corpo = { sobre: { titulo: 'ZZ Sobre', texto: 'ZZ texto geral', destaques: [{ titulo: 'ZZ d1', descricao: '' }] }, galeria: { titulo: 'ZZ Galeria', texto: '' }, participar: { titulo: 'ZZ Part', texto: '' } };
  assert.equal((await c('PUT', '/conteudo/geektopia', H, corpo)).s, 403);
  assert.equal((await c('PUT', '/conteudo/geektopia', admin, { ...corpo, sobre: { ...corpo.sobre, titulo: '' } })).s, 400);
  assert.equal((await c('PUT', '/conteudo/geektopia', admin, { ...corpo, sobre: { ...corpo.sobre, destaques: [1, 2, 3, 4, 5].map((n) => ({ titulo: `d${n}` })) } })).s, 400);
  assert.equal((await c('PUT', '/conteudo/geektopia', admin, corpo)).s, 200);
  const vit = (await c('GET', '/geektopia/vitrine', {})).b;
  assert.equal(vit.conteudo.sobre.titulo, 'ZZ Sobre', 'a página pública usa o texto editado');
  assert.equal((await c('DELETE', '/conteudo/geektopia', admin)).s, 200);
  assert.notEqual((await c('GET', '/conteudo/geektopia', {})).b.sobre.titulo, 'ZZ Sobre');
});

test('carrossel não depende de edição: criar/apagar edição não muda as fotos do site', async () => {
  const c = servidor.call;
  const foto = await prisma.foto_Site.create({ data: { area: 'geektopia', url_foto: 'http://localhost/zz.jpg', legenda: 'ZZ foto', ordem: 99 } });
  const antes = (await c('GET', '/geektopia/vitrine', {})).b.galeria.map((f) => f.id_foto);
  assert.ok(antes.includes(foto.id_foto));
  const ed = await prisma.geektopia.create({ data: { nome_edicao: 'ZZ EDICAO NOVA', tipo_edicao: 'PrincipalAnterior', status_evento: 'VendasAbertas', classificacao_etaria: 0 } });
  await prisma.geektopia.delete({ where: { id_geektopia: ed.id_geektopia } });
  const depois = (await c('GET', '/geektopia/vitrine', {})).b.galeria.map((f) => f.id_foto);
  assert.deepEqual(depois, antes);
  const { H } = await criarUsuario('pg2');
  assert.equal((await c('DELETE', `/fotos-site/${foto.id_foto}`, H)).s, 403, 'só admin remove');
  assert.equal((await c('PUT', `/fotos-site/${foto.id_foto}`, admin, { legenda: 'ZZ nova' })).s, 200);
  assert.equal((await c('PATCH', '/fotos-site/reordenar', admin, { ids: [foto.id_foto, foto.id_foto] })).s, 400, 'ids repetidos');
  assert.equal((await c('DELETE', `/fotos-site/${foto.id_foto}`, admin)).s, 200);
});
