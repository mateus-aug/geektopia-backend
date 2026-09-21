// Ambiente de teste compartilhado. LEIA ANTES DE MEXER: aqui mora a trava de segurança financeira.
//
//  - O Mercado Pago é SEMPRE simulado nos testes: o módulo `mercadopago` é substituído ANTES de a
//    aplicação ser carregada, o token é falso e, se a simulação não estiver ativa, o teste ABORTA.
//    Nenhum teste pode gerar cobrança, consultar pagamento ou fazer estorno de verdade.
//  - Os testes usam o banco configurado no .env, mas só mexem em dados com prefixo "ZZ" (e apagam
//    tudo ao final). Para isolar de vez, aponte DATABASE_URL para um banco de testes.
const R = require('path').resolve(__dirname, '..', '..');
process.chdir(R);
require(R + '/node_modules/dotenv').config({ quiet: true });

process.env.MP_ACCESS_TOKEN = 'TOKEN-FALSO-DE-TESTE';
process.env.NODE_ENV = process.env.NODE_ENV === 'production' ? 'test' : (process.env.NODE_ENV || 'test');
delete process.env.MP_WEBHOOK_SECRET;

// Estado controlável da simulação.
const INICIO = new Date(); // tudo que os testes criarem a partir daqui é apagado no fim
const mp = { chamadas: 0, pagamento: null, pagamentos: [], reembolsos: [] };

class PreferenceFalsa {
  async create() { mp.chamadas += 1; return { init_point: `https://mp.simulado/pagar/${mp.chamadas}` }; }
}
class PaymentFalso {
  async get() { return mp.pagamento; }
  async search() { return { results: mp.pagamentos }; }
}
class PaymentRefundFalso {
  async create(args) { mp.reembolsos.push(args); return { id: 900000 + mp.reembolsos.length, status: 'approved' }; }
}

const caminhoMP = require.resolve(R + '/node_modules/mercadopago');
const real = require(caminhoMP);
require.cache[caminhoMP] = {
  id: caminhoMP, filename: caminhoMP, loaded: true, children: [], paths: [],
  exports: {
    MercadoPagoConfig: real.MercadoPagoConfig, Preference: PreferenceFalsa, Payment: PaymentFalso, PaymentRefund: PaymentRefundFalso
  }
};
if (require(caminhoMP).Preference !== PreferenceFalsa) {
  console.error('ABORTADO: a simulação do Mercado Pago não está ativa. Nenhum teste financeiro pode rodar.');
  process.exit(2);
}

const jwt = require(R + '/node_modules/jsonwebtoken');
const bcrypt = require(R + '/node_modules/bcryptjs');
const prisma = require(R + '/src/config/prisma');
const app = require(R + '/src/app');

const token = (id, admin) => jwt.sign({ id, isAdmin: admin }, process.env.JWT_SECRET, { expiresIn: '15m' });

module.exports = { R, mp, jwt, bcrypt, prisma, app, token };

// ---- utilitários comuns ----
async function iniciarServidor() {
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/api`;
  const call = async (metodo, url, headers, corpo) => {
    const r = await fetch(base + url, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
    const tipo = r.headers.get('content-type') || '';
    let b = null;
    if (tipo.includes('json')) { try { b = await r.json(); } catch { /* sem corpo */ } } else { b = Buffer.from(await r.arrayBuffer()); }
    return { s: r.status, b, tipo, cab: r.headers };
  };
  return { srv, base, call, fechar: () => new Promise((r) => srv.close(r)) };
}

const cabecalho = (id, admin = false) => ({ Authorization: `Bearer ${token(id, admin)}`, 'Content-Type': 'application/json' });

const CPFS = ['52998224725', '11144477735', '39053344705', '15350946056', '86288366757'];
const titular = (nome, cpf, nasc = '1995-03-10') => ({ nome_completo: nome, tipo_documento: 'cpf', documento: cpf, data_nascimento: nasc });

// Cria um usuário ZZ (dados de teste) e devolve { u, H } (H = cabeçalhos autenticados).
async function criarUsuario(sufixo, extra = {}) {
  const u = await prisma.usuario.create({ data: { nome_completo: `ZZ Teste ${sufixo}`, email: `zz.${sufixo}@teste.local`, senha: await bcrypt.hash('x', 4), data_nascimento: new Date('1990-01-01'), ...extra } });
  return { u, H: cabecalho(u.id_usuario) };
}

// Apaga TUDO que os testes criaram (usuários, pedidos, ingressos, edições e lotes com prefixo ZZ).
async function limparZZ() {
  // Avisos gerados pelos testes para os administradores (alertas, pedidos novos...) não podem sobrar no painel de verdade.
  const admins = (await prisma.administrador.findMany({ select: { id_usuario: true } })).map((a) => a.id_usuario);
  await prisma.notificacao.deleteMany({ where: { id_usuario: { in: admins }, criada_em: { gte: INICIO } } });
  const us = (await prisma.usuario.findMany({ where: { email: { startsWith: 'zz.' } }, select: { id_usuario: true } })).map((u) => u.id_usuario);
  const eds = (await prisma.geektopia.findMany({ where: { nome_edicao: { startsWith: 'ZZ' } }, select: { id_geektopia: true } })).map((e) => e.id_geektopia);
  await prisma.ingresso.deleteMany({ where: { OR: [{ id_usuario: { in: us } }, { id_geektopia: { in: eds } }] } });
  const peds = (await prisma.pedido.findMany({ where: { id_usuario: { in: us } }, select: { id_pedido: true } })).map((p) => p.id_pedido);
  await prisma.solicitacao_Espaco.updateMany({ where: { id_pedido: { in: peds } }, data: { id_pedido: null } });
  await prisma.inscricao_Competicao.updateMany({ where: { id_pedido: { in: peds } }, data: { id_pedido: null } });
  await prisma.item_Pedido.deleteMany({ where: { id_pedido: { in: peds } } });
  await prisma.pagamento.deleteMany({ where: { id_pedido: { in: peds } } });
  await prisma.pedido.deleteMany({ where: { id_pedido: { in: peds } } });
  await prisma.ajudante_Expositor.deleteMany({ where: { solicitacao: { id_usuario: { in: us } } } });
  await prisma.solicitacao_Espaco.deleteMany({ where: { OR: [{ id_usuario: { in: us } }, { id_geektopia: { in: eds } }] } });
  await prisma.inscricao_Competicao.deleteMany({ where: { id_usuario: { in: us } } });
  await prisma.equipe_Competicao.deleteMany({ where: { id_lider: { in: us } } });
  await prisma.competicao.deleteMany({ where: { id_geektopia: { in: eds } } });
  await prisma.espaco.deleteMany({ where: { id_geektopia: { in: eds } } });
  await prisma.lote.deleteMany({ where: { id_geektopia: { in: eds } } });
  await prisma.geektopia.deleteMany({ where: { id_geektopia: { in: eds } } });
  await prisma.expositor.deleteMany({ where: { id_usuario: { in: us } } });
  await prisma.competidor.deleteMany({ where: { id_usuario: { in: us } } });
  await prisma.participante.deleteMany({ where: { id_usuario: { in: us } } });
  await prisma.usuario.deleteMany({ where: { id_usuario: { in: us } } });
}

// Edição com vendas abertas + lotes (padrão dos testes de ingresso).
async function criarEdicaoComLotes(lotes, extra = {}) {
  const g = await prisma.geektopia.create({ data: { nome_edicao: 'ZZ EDICAO TESTE', tipo_edicao: 'Pocket', status_evento: 'Bloqueado', classificacao_etaria: 0, local: 'Clube Verde', data_inicio: new Date('2027-05-01T13:00:00Z'), ...extra } });
  const criados = [];
  for (const l of lotes) criados.push(await prisma.lote.create({ data: { id_geektopia: g.id_geektopia, categoria: 'Inteira', ...l } }));
  await prisma.geektopia.update({ where: { id_geektopia: g.id_geektopia }, data: { status_evento: 'VendasAbertas' } });
  return { g, lotes: criados };
}

const pagamentoAprovado = (idPedido, valor, extra = {}) => ({
  status: 'approved', id: 700000 + idPedido, payment_method_id: 'pix', payment_type_id: 'bank_transfer', transaction_amount: valor, currency_id: 'BRL',
  external_reference: JSON.stringify({ id_pedido: idPedido }), ...extra
});

Object.assign(module.exports, { iniciarServidor, cabecalho, CPFS, titular, criarUsuario, limparZZ, criarEdicaoComLotes, pagamentoAprovado });
