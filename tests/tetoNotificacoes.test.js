// SININHO DO ADMIN: teto de avisos não lidos por tipo, para ninguém lotar a caixa dos administradores.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, limparZZ } = require('./helpers/ambiente');

test.after(async () => { await limparZZ(); await prisma.$disconnect(); });

test('o sininho do admin tem teto de avisos não lidos por tipo', async () => {
  const { notificarAdmins } = require('../src/services/notificacoes');
  const adm = await prisma.administrador.findFirst();
  const inicio = new Date();
  await prisma.notificacao.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ id_usuario: adm.id_usuario, tipo: 'zz_flood', titulo: `ZZ ${i}` })) });
  await notificarAdmins({ tipo: 'zz_flood', titulo: 'ZZ excedente' });
  const total = await prisma.notificacao.count({ where: { id_usuario: adm.id_usuario, tipo: 'zz_flood' } });
  await prisma.notificacao.deleteMany({ where: { tipo: 'zz_flood', criada_em: { gte: new Date(inicio.getTime() - 60000) } } });
  assert.equal(total, 30, 'o 31º aviso do mesmo tipo não entra');
});
