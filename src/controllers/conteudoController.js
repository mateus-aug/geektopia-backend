const prisma = require('../config/prisma');

// Conteúdo editável da landing page. O que o admin não personalizou usa o texto PADRÃO abaixo,
// então a página nunca fica vazia e "restaurar padrão" é só apagar o registro.
// (O front tem uma cópia deste padrão só para o caso de a API estar fora do ar.)
const PADRAO = {
  hero: {
    selo: 'Conselho de Cultura POP de Ponta Grossa',
    titulo: 'A cena *geek e pop* de Ponta Grossa começa aqui.',
    lead: 'Ingressos, competições e espaço para expositores da Geektopia e dos Pockets, tudo num só lugar.',
    confianca: ['Compra segura', 'Ingresso no celular', 'Acompanhe tudo online']
  },
  numeros: [
    { valor: '3', legenda: 'edições realizadas desde 2023' },
    { valor: '+5 mil', legenda: 'visitantes na última edição' },
    { valor: '40+', legenda: 'expositores e competidores' }
  ],
  sobre: {
    titulo: 'Quem é o CCPOP?',
    texto: 'O CCPOP (Conselho de Cultura Pop de Ponta Grossa) é uma entidade organizadora voltada a fomentar, estruturar e expandir a cena geek, nerd e pop nos Campos Gerais. Nosso objetivo é inserir Ponta Grossa de vez na rota dos grandes eventos estaduais do setor, valorizando a economia criativa e unindo a comunidade entusiasta.',
    etiquetas: ['Games', 'Animes', 'K-pop', 'RPG', 'Artes visuais']
  },
  chamada: {
    titulo: 'Quer expor ou competir na próxima Geektopia?',
    texto: 'As solicitações de espaço e as inscrições em competições são feitas pela plataforma. A organização analisa e você acompanha o resultado.'
  },
  rodape: {
    nome: 'Conselho de Cultura POP de Ponta Grossa',
    instagram: 'https://instagram.com/ccpop.pg'
  }
};

const CHAVE = 'landing';

// Junta o que foi salvo com o padrão, seção por seção (campo ausente = padrão).
function combinar(salvo) {
  const s = salvo && typeof salvo === 'object' ? salvo : {};
  return {
    hero: { ...PADRAO.hero, ...(s.hero || {}) },
    numeros: Array.isArray(s.numeros) ? s.numeros : PADRAO.numeros,
    sobre: { ...PADRAO.sobre, ...(s.sobre || {}) },
    chamada: { ...PADRAO.chamada, ...(s.chamada || {}) },
    rodape: { ...PADRAO.rodape, ...(s.rodape || {}) }
  };
}

const texto = (v, max, campo, { obrigatorio = true } = {}) => {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') return { erro: `O campo "${campo}" deve ser um texto.` };
  const t = v.trim();
  if (obrigatorio && !t) return { erro: `O campo "${campo}" não pode ficar vazio.` };
  if (t.length > max) return { erro: `O campo "${campo}" deve ter no máximo ${max} caracteres.` };
  return { valor: t };
};

function lista(v, { max, tamanho, campo, minimo = 0 }) {
  if (!Array.isArray(v)) return { erro: `O campo "${campo}" deve ser uma lista.` };
  const itens = v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
  if (itens.length < minimo) return { erro: `Informe pelo menos ${minimo} item(ns) em "${campo}".` };
  if (itens.length > max) return { erro: `"${campo}" aceita no máximo ${max} itens.` };
  if (itens.some((i) => i.length > tamanho)) return { erro: `Cada item de "${campo}" deve ter no máximo ${tamanho} caracteres.` };
  return { valor: itens };
}

function validar(corpo) {
  const saida = {};
  const h = corpo.hero || {};
  const partes = [
    ['selo', texto(h.selo, 80, 'hero.selo')],
    ['titulo', texto(h.titulo, 140, 'hero.titulo')],
    ['lead', texto(h.lead, 300, 'hero.lead')],
    ['confianca', lista(h.confianca, { max: 4, tamanho: 40, campo: 'hero.confianca' })]
  ];
  saida.hero = {};
  for (const [k, r] of partes) { if (r.erro) return { erro: r.erro }; saida.hero[k] = r.valor; }

  if (!Array.isArray(corpo.numeros) || corpo.numeros.length > 4) return { erro: 'Os números aceitam no máximo 4 itens.' };
  saida.numeros = [];
  for (const [i, n] of corpo.numeros.entries()) {
    const v = texto(n?.valor, 16, `numeros[${i + 1}].valor`); if (v.erro) return { erro: v.erro };
    const l = texto(n?.legenda, 80, `numeros[${i + 1}].legenda`); if (l.erro) return { erro: l.erro };
    saida.numeros.push({ valor: v.valor, legenda: l.valor });
  }

  const s = corpo.sobre || {};
  const st = texto(s.titulo, 80, 'sobre.titulo'); if (st.erro) return { erro: st.erro };
  const sx = texto(s.texto, 1200, 'sobre.texto'); if (sx.erro) return { erro: sx.erro };
  const se = lista(s.etiquetas, { max: 8, tamanho: 30, campo: 'sobre.etiquetas' }); if (se.erro) return { erro: se.erro };
  saida.sobre = { titulo: st.valor, texto: sx.valor, etiquetas: se.valor };

  const c = corpo.chamada || {};
  const ct = texto(c.titulo, 110, 'chamada.titulo'); if (ct.erro) return { erro: ct.erro };
  const cx = texto(c.texto, 300, 'chamada.texto'); if (cx.erro) return { erro: cx.erro };
  saida.chamada = { titulo: ct.valor, texto: cx.valor };

  const r = corpo.rodape || {};
  const rn = texto(r.nome, 80, 'rodape.nome'); if (rn.erro) return { erro: rn.erro };
  const ri = texto(r.instagram, 200, 'rodape.instagram', { obrigatorio: false }); if (ri.erro) return { erro: ri.erro };
  if (ri.valor && !/^https:\/\//i.test(ri.valor)) return { erro: 'O link do Instagram deve começar com https://.' };
  saida.rodape = { nome: rn.valor, instagram: ri.valor };

  return { valor: saida };
}

// GET /api/conteudo/landing — público
exports.buscarLanding = async (req, res) => {
  try {
    const reg = await prisma.conteudo_Site.findUnique({ where: { chave: CHAVE } });
    return res.json({ ...combinar(reg?.valor), personalizado: Boolean(reg), atualizado_em: reg?.atualizado_em ?? null });
  } catch (error) {
    console.error('Erro ao buscar o conteúdo da landing:', error);
    return res.status(500).json({ error: 'Erro ao carregar o conteúdo da página.' });
  }
};

// PUT /api/conteudo/landing — admin
exports.salvarLanding = async (req, res) => {
  try {
    const { erro, valor } = validar(req.body || {});
    if (erro) return res.status(400).json({ error: erro });

    const reg = await prisma.conteudo_Site.upsert({
      where: { chave: CHAVE },
      create: { chave: CHAVE, valor },
      update: { valor, atualizado_em: new Date() }
    });
    return res.json({ message: 'Página atualizada!', ...combinar(reg.valor), personalizado: true, atualizado_em: reg.atualizado_em });
  } catch (error) {
    console.error('Erro ao salvar o conteúdo da landing:', error);
    return res.status(500).json({ error: 'Erro ao salvar o conteúdo da página.' });
  }
};

// DELETE /api/conteudo/landing — admin: volta ao texto padrão
exports.restaurarLanding = async (req, res) => {
  try {
    await prisma.conteudo_Site.deleteMany({ where: { chave: CHAVE } });
    return res.json({ message: 'Textos padrão restaurados.', ...combinar(null), personalizado: false });
  } catch (error) {
    console.error('Erro ao restaurar o conteúdo da landing:', error);
    return res.status(500).json({ error: 'Erro ao restaurar os textos.' });
  }
};

// GET /api/conteudo/sugestoes — admin: o que o sistema já contabiliza, para ajudar a preencher os números
exports.sugestoes = async (req, res) => {
  try {
    const [edicoes, ingressos, expositores, inscricoes] = await Promise.all([
      prisma.geektopia.count({ where: { tipo_edicao: { in: ['Principal', 'PrincipalAnterior'] } } }),
      prisma.ingresso.count({ where: { status_ingresso: { not: 'Cancelado' } } }),
      prisma.solicitacao_Espaco.count({ where: { status_solicitacao: 'Aprovado' } }),
      prisma.inscricao_Competicao.count({ where: { status_inscricao: 'Aprovado' } })
    ]);
    return res.json({ edicoes_principais: edicoes, ingressos_emitidos: ingressos, expositores_aprovados: expositores, competidores_aprovados: inscricoes });
  } catch (error) {
    console.error('Erro ao calcular sugestões:', error);
    return res.status(500).json({ error: 'Erro ao calcular os números do sistema.' });
  }
};

// ---------------------------------------------------------------- PÁGINA GEEKTOPIA
// Textos gerais da página /geektopia. Não dependem de nenhuma edição: criar um novo evento não os altera.
const PADRAO_GEEKTOPIA = {
  sobre: {
    titulo: 'Sobre a Geektopia',
    texto: 'A Geektopia é o encontro da cultura geek, nerd e pop de Ponta Grossa. Reúne games, animes, quadrinhos, música, cosplay, competições e uma feira de artistas e lojas, organizada pelo CCPOP com a comunidade.\n\nA cada edição, novos convidados, competições e expositores. Aqui você acompanha as novidades e garante o seu lugar.',
    destaques: []
  },
  galeria: { titulo: 'Galeria de fotos', texto: 'Um gostinho do que já rolou na Geektopia. Arraste ou use as setas.' },
  participar: { titulo: 'Como você quer participar?', texto: 'Escolha o seu papel na Geektopia. Você pode ser mais de um.' }
};
const CHAVE_GEEKTOPIA = 'geektopia';

function combinarGeektopia(salvo) {
  const s = salvo && typeof salvo === 'object' ? salvo : {};
  return {
    sobre: { ...PADRAO_GEEKTOPIA.sobre, ...(s.sobre || {}), destaques: Array.isArray(s.sobre?.destaques) ? s.sobre.destaques : PADRAO_GEEKTOPIA.sobre.destaques },
    galeria: { ...PADRAO_GEEKTOPIA.galeria, ...(s.galeria || {}) },
    participar: { ...PADRAO_GEEKTOPIA.participar, ...(s.participar || {}) }
  };
}

async function conteudoGeektopia() {
  const reg = await prisma.conteudo_Site.findUnique({ where: { chave: CHAVE_GEEKTOPIA } });
  return combinarGeektopia(reg?.valor);
}

function validarGeektopia(corpo) {
  const saida = {};
  const s = corpo.sobre || {};
  const t = texto(s.titulo, 80, 'sobre.titulo'); if (t.erro) return { erro: t.erro };
  const x = texto(s.texto, 3000, 'sobre.texto'); if (x.erro) return { erro: x.erro };
  if (!Array.isArray(s.destaques) || s.destaques.length > 4) return { erro: 'Os destaques aceitam no máximo 4 itens.' };
  const destaques = [];
  for (const [i, d] of s.destaques.entries()) {
    const dt = texto(d?.titulo, 60, `sobre.destaques[${i + 1}].titulo`); if (dt.erro) return { erro: dt.erro };
    const dd = texto(d?.descricao, 160, `sobre.destaques[${i + 1}].descricao`, { obrigatorio: false }); if (dd.erro) return { erro: dd.erro };
    destaques.push({ titulo: dt.valor, descricao: dd.valor });
  }
  saida.sobre = { titulo: t.valor, texto: x.valor, destaques };

  for (const [chave, maxT, maxX] of [['galeria', 80, 200], ['participar', 80, 200]]) {
    const c = corpo[chave] || {};
    const ct = texto(c.titulo, maxT, `${chave}.titulo`); if (ct.erro) return { erro: ct.erro };
    const cx = texto(c.texto, maxX, `${chave}.texto`, { obrigatorio: false }); if (cx.erro) return { erro: cx.erro };
    saida[chave] = { titulo: ct.valor, texto: cx.valor };
  }
  return { valor: saida };
}

// GET /api/conteudo/geektopia — público
exports.buscarGeektopia = async (req, res) => {
  try {
    const reg = await prisma.conteudo_Site.findUnique({ where: { chave: CHAVE_GEEKTOPIA } });
    return res.json({ ...combinarGeektopia(reg?.valor), personalizado: Boolean(reg) });
  } catch (error) {
    console.error('Erro ao buscar o conteúdo da página Geektopia:', error);
    return res.status(500).json({ error: 'Erro ao carregar o conteúdo da página.' });
  }
};

// PUT /api/conteudo/geektopia — admin
exports.salvarGeektopia = async (req, res) => {
  try {
    const { erro, valor } = validarGeektopia(req.body || {});
    if (erro) return res.status(400).json({ error: erro });
    const reg = await prisma.conteudo_Site.upsert({ where: { chave: CHAVE_GEEKTOPIA }, create: { chave: CHAVE_GEEKTOPIA, valor }, update: { valor, atualizado_em: new Date() } });
    return res.json({ message: 'Página atualizada!', ...combinarGeektopia(reg.valor), personalizado: true });
  } catch (error) {
    console.error('Erro ao salvar o conteúdo da página Geektopia:', error);
    return res.status(500).json({ error: 'Erro ao salvar o conteúdo da página.' });
  }
};

// DELETE /api/conteudo/geektopia — admin: volta ao texto padrão
exports.restaurarGeektopia = async (req, res) => {
  try {
    await prisma.conteudo_Site.deleteMany({ where: { chave: CHAVE_GEEKTOPIA } });
    return res.json({ message: 'Textos padrão restaurados.', ...combinarGeektopia(null), personalizado: false });
  } catch (error) {
    console.error('Erro ao restaurar o conteúdo da página Geektopia:', error);
    return res.status(500).json({ error: 'Erro ao restaurar os textos.' });
  }
};

exports.conteudoGeektopia = conteudoGeektopia;
exports.PADRAO = PADRAO;
