// NICKNAME ÚNICO POR EDIÇÃO (pedido dos professores).
//
// Garante que:
//   1. dois competidores não usam o mesmo nickname na mesma edição — ignorando
//      maiúsculas, acentos e espaços ("Raul" = "ráúl ");
//   2. em edições diferentes o mesmo nickname é permitido;
//   3. reprovação libera o nickname;
//   4. trocar o nick no perfil depois de inscrito não burla a regra;
//   5. pedidos simultâneos não furam a regra (corrida) — nem com dois "Raul"
//      chegando juntos, nem com clique duplo da mesma pessoa.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma, iniciarServidor, cabecalho, criarUsuario, limparZZ } = require('./helpers/ambiente');
const { normalizarNick } = require('../src/utils/nicknameEvento');

const LINK = 'https://instagram.com/zz';
let servidor;
let admin;
let smtpGuardado;

test.before(async () => {
  await limparZZ();
  servidor = await iniciarServidor();
  admin = cabecalho((await prisma.administrador.findFirst()).id_usuario, true);
  // A reprovação notifica o competidor por e-mail: nada de enviar de verdade.
  smtpGuardado = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
});

test.after(async () => {
  if (smtpGuardado) process.env.SMTP_HOST = smtpGuardado;
  await limparZZ();
  await servidor.fechar();
  await prisma.$disconnect();
});

const edicao = (nome) =>
  prisma.geektopia.create({
    data: { nome_edicao: `ZZ ${nome}`, tipo_edicao: 'Pocket', status_evento: 'VendasAbertas', classificacao_etaria: 0 }
  });
const competicao = (ed, nome) =>
  prisma.competicao.create({
    data: { id_geektopia: ed.id_geektopia, nome_competicao: `ZZ ${nome}`, modalidade: 'Solo', valor_taxa_inscricao: 0 }
  });

/** Usuário ZZ já com perfil de competidor e o nickname pedido. */
async function competidor(sufixo, nickname) {
  const { u, H } = await criarUsuario(`nick.${sufixo}`);
  const r = await servidor.call('POST', '/parceiros/competidor', H, { nickname_competidor: nickname });
  assert.equal(r.s, 201, `criar competidor ${nickname}: ${JSON.stringify(r.b)}`);
  return { u, H };
}

const inscrever = (H, comp) =>
  servidor.call('POST', '/inscricoes', H, { id_competicao: comp.id_competicao, url_portfolio_apresentacao: LINK });

test('normalização: maiúsculas, acentos e espaços não diferenciam', () => {
  assert.equal(normalizarNick('Raul'), normalizarNick('  ráúl '));
  assert.equal(normalizarNick('Dark  Lord'), normalizarNick('dark lord'));
  assert.notEqual(normalizarNick('Raul'), normalizarNick('Raul2'));
  assert.equal(normalizarNick(null), '');
});

test('mesmo nickname: barrado na mesma edição, livre em outra, liberado ao reprovar', async () => {
  const ed1 = await edicao('NICK ED1');
  const ed2 = await edicao('NICK ED2');
  const cosplay = await competicao(ed1, 'Cosplay');
  const kpop = await competicao(ed1, 'Kpop');
  const outraEdicao = await competicao(ed2, 'Cosplay');

  const a = await competidor('a', 'Raul');
  const b = await competidor('b', '  ráúl ');

  const ia = await inscrever(a.H, cosplay);
  assert.equal(ia.s, 201);

  // Competição DIFERENTE, mas mesma edição: barra.
  const ib = await inscrever(b.H, kpop);
  assert.equal(ib.s, 409, 'mesmo nick na mesma edição');
  assert.equal(ib.b.campo, 'nickname_competidor', 'o front precisa saber qual campo destacar');
  assert.match(ib.b.error, /já está em uso/);

  // Outra edição: pode.
  assert.equal((await inscrever(b.H, outraEdicao)).s, 201, 'mesmo nick em OUTRA edição é permitido');

  // A pessoa que segurava o nome foi reprovada: o nome fica livre.
  const rep = await servidor.call('PATCH', `/inscricoes/admin/${ia.b.inscricao.id_inscricao}/status`, admin, {
    status_inscricao: 'Reprovado', observacao_admin: 'Material incompleto.'
  });
  assert.equal(rep.s, 200, JSON.stringify(rep.b));
  assert.equal((await inscrever(b.H, kpop)).s, 201, 'reprovado libera o nickname');
});

test('trocar o nick no perfil depois de inscrito não burla a regra', async () => {
  const ed = await edicao('NICK TROCA');
  const comp = await competicao(ed, 'Desenho');

  const dono = await competidor('dono', 'Kira');
  const outro = await competidor('outro', 'Light');
  assert.equal((await inscrever(dono.H, comp)).s, 201);
  assert.equal((await inscrever(outro.H, comp)).s, 201);

  const roubo = await servidor.call('PUT', '/parceiros/competidor', outro.H, { nickname_competidor: 'KIRA' });
  assert.equal(roubo.s, 409, 'não pode renomear para um nick já usado na edição');
  assert.equal(roubo.b.campo, 'nickname_competidor');

  const salvo = await prisma.competidor.findUnique({ where: { id_usuario: outro.u.id_usuario } });
  assert.equal(salvo.nickname_competidor, 'Light', 'a troca recusada não pode ter sido gravada');

  // Trocar para um nick livre continua funcionando normalmente.
  assert.equal((await servidor.call('PUT', '/parceiros/competidor', outro.H, { nickname_competidor: 'Ryuk' })).s, 200);

  // Quem não está inscrito em nada pode usar qualquer nick: não há edição em jogo.
  const avulso = await competidor('avulso', 'Misa');
  assert.equal((await servidor.call('PUT', '/parceiros/competidor', avulso.H, { nickname_competidor: 'Kira' })).s, 200);
});

test('corrida: dois competidores com o mesmo nick ao mesmo tempo — só um entra', async () => {
  const ed = await edicao('NICK CORRIDA');
  const comp1 = await competicao(ed, 'Corrida A');
  const comp2 = await competicao(ed, 'Corrida B');
  const x = await competidor('x', 'Gêmeo');
  const y = await competidor('y', 'gemeo');

  const respostas = await Promise.all([inscrever(x.H, comp1), inscrever(y.H, comp2)]);
  const status = respostas.map((r) => r.s).sort();
  assert.deepEqual(status, [201, 409], `esperado um 201 e um 409, veio ${status}`);
});

test('corrida: clique duplo da mesma pessoa cria UMA inscrição só', async () => {
  const ed = await edicao('NICK CLIQUE');
  const comp = await competicao(ed, 'Clique');
  const z = await competidor('z', 'Apressado');

  const respostas = await Promise.all([inscrever(z.H, comp), inscrever(z.H, comp), inscrever(z.H, comp)]);
  const criadas = respostas.filter((r) => r.s === 201).length;
  assert.equal(criadas, 1, `clique triplo criou ${criadas} inscrições`);
  assert.equal(await prisma.inscricao_Competicao.count({ where: { id_usuario: z.u.id_usuario } }), 1);
});
