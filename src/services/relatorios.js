// RELATÓRIOS: agrega dados para o painel. As funções de contagem são puras (recebem listas simples), para
// serem testadas sem banco. Quem busca no banco é o relatorioController.

const FAIXAS = [
  { rotulo: 'Até 11 anos', min: 0, max: 11 },
  { rotulo: '12 a 17', min: 12, max: 17 },
  { rotulo: '18 a 24', min: 18, max: 24 },
  { rotulo: '25 a 34', min: 25, max: 34 },
  { rotulo: '35 a 44', min: 35, max: 44 },
  { rotulo: '45 a 59', min: 45, max: 59 },
  { rotulo: '60 anos ou mais', min: 60, max: 200 }
];

const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '');
// "ponta  grossa", "Ponta Grossa" e "Ponta Grossá" viram a mesma cidade.
const chaveTexto = (t) => semAcento(String(t ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();
const capitalizar = (t) => String(t).trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(D[aeo]s?|E)\b/g, (m) => m.toLowerCase());

function idadeEm(nascimento, referencia = new Date()) {
  if (!nascimento) return null;
  const n = new Date(nascimento);
  if (Number.isNaN(n.getTime())) return null;
  let idade = referencia.getUTCFullYear() - n.getUTCFullYear();
  const jaFez = referencia.getUTCMonth() > n.getUTCMonth() || (referencia.getUTCMonth() === n.getUTCMonth() && referencia.getUTCDate() >= n.getUTCDate());
  if (!jaFez) idade -= 1;
  return idade >= 0 && idade <= 120 ? idade : null;
}

const faixaDaIdade = (idade) => (idade === null ? 'Não informada' : FAIXAS.find((f) => idade >= f.min && idade <= f.max)?.rotulo || 'Não informada');
const arred = (n) => Math.round(n * 100) / 100;

// Conta itens por uma chave e devolve [{ chave, rotulo, quantidade, percentual }] do maior para o menor.
function contar(itens, obterChave, { rotuloDe = (k) => k, limite = null } = {}) {
  const mapa = new Map();
  for (const it of itens) {
    const { chave, rotulo } = obterChave(it);
    const atual = mapa.get(chave) || { chave, rotulo, quantidade: 0 };
    atual.quantidade += 1;
    mapa.set(chave, atual);
  }
  const total = itens.length;
  let lista = [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  if (limite && lista.length > limite) {
    const resto = lista.slice(limite).reduce((s, x) => s + x.quantidade, 0);
    lista = [...lista.slice(0, limite), { chave: '__outras', rotulo: 'Outras', quantidade: resto }];
  }
  return lista.map((x) => ({ chave: x.chave, rotulo: rotuloDe(x.rotulo), quantidade: x.quantidade, percentual: total ? arred((x.quantidade / total) * 100) : 0 }));
}

// pessoas: [{ cidade, estado, genero, idade }]
// Quem esqueceu o estado herda o da mesma cidade quando ela aparece com um único estado nos dados
// ("Ponta Grossa" sem estado + "Ponta Grossa - PR" = uma cidade só).
function completarEstados(pessoas) {
  const estadosDaCidade = new Map();
  for (const p of pessoas) {
    if (!p.cidade || !p.estado) continue;
    const k = chaveTexto(p.cidade);
    (estadosDaCidade.get(k) || estadosDaCidade.set(k, new Set()).get(k)).add(p.estado.toUpperCase());
  }
  return pessoas.map((p) => {
    const unicos = p.cidade && !p.estado ? estadosDaCidade.get(chaveTexto(p.cidade)) : null;
    return unicos && unicos.size === 1 ? { ...p, estado: [...unicos][0] } : p;
  });
}

function demografia(entrada) {
  const pessoas = completarEstados(entrada);
  const cidade = contar(pessoas, (p) => {
    if (!p.cidade) return { chave: 'nao', rotulo: 'Não informada' };
    return { chave: `${chaveTexto(p.cidade)}|${(p.estado || '').toUpperCase()}`, rotulo: `${capitalizar(p.cidade)}${p.estado ? ` - ${p.estado.toUpperCase()}` : ''}` };
  }, { limite: null });
  const estado = contar(pessoas, (p) => ({ chave: (p.estado || 'nao').toUpperCase(), rotulo: p.estado ? p.estado.toUpperCase() : 'Não informado' }));
  const genero = contar(pessoas, (p) => ({ chave: chaveTexto(p.genero) || 'nao', rotulo: p.genero ? capitalizar(p.genero) : 'Não informado' }));
  const faixa = contar(pessoas, (p) => { const r = faixaDaIdade(p.idade); return { chave: r, rotulo: r }; });
  const ordemFaixa = [...FAIXAS.map((f) => f.rotulo), 'Não informada'];
  faixa.sort((a, b) => ordemFaixa.indexOf(a.rotulo) - ordemFaixa.indexOf(b.rotulo));
  return { por_cidade: cidade, por_estado: estado, por_genero: genero, por_faixa_etaria: faixa };
}

// Filtros demográficos (cidade, estado, gênero, faixa etária) aplicados a uma pessoa.
function passaNoFiltro(p, f) {
  if (f.estado && (p.estado || '').toUpperCase() !== f.estado.toUpperCase()) return false;
  if (f.cidade && chaveTexto(p.cidade) !== chaveTexto(f.cidade)) return false;
  if (f.genero && chaveTexto(p.genero) !== chaveTexto(f.genero)) return false;
  if (f.faixa) {
    if (faixaDaIdade(p.idade) !== f.faixa) return false;
  }
  return true;
}

// Vendas por dia (fuso de Brasília), completando os dias sem venda com zero.
const diaBR = (d) => new Date(new Date(d).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
function vendasPorDia(vendas) {
  if (vendas.length === 0) return [];
  const mapa = new Map();
  for (const v of vendas) {
    const k = diaBR(v.data);
    const a = mapa.get(k) || { dia: k, ingressos: 0, receita: 0 };
    a.ingressos += 1; a.receita = arred(a.receita + (v.valor || 0));
    mapa.set(k, a);
  }
  const dias = [...mapa.keys()].sort();
  const saida = [];
  for (let t = new Date(`${dias[0]}T00:00:00Z`).getTime(); t <= new Date(`${dias[dias.length - 1]}T00:00:00Z`).getTime(); t += 86400000) {
    const k = new Date(t).toISOString().slice(0, 10);
    saida.push(mapa.get(k) || { dia: k, ingressos: 0, receita: 0 });
  }
  return saida;
}

// CSV para planilha em português (Excel/Sheets): separador ";", BOM UTF-8 e decimais com vírgula.
// Células que começam com = + - @ ganham um apóstrofo, para não serem executadas como fórmula.
const celulaCsv = (v) => {
  let t = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  if (/^[=+\-@\t\r]/.test(t) && typeof v !== 'number') t = `'${t}`;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const paraCsv = (cabecalho, linhas) => `\uFEFF${[cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(';')).join('\r\n')}\r\n`;

module.exports = { FAIXAS, chaveTexto, capitalizar, idadeEm, faixaDaIdade, contar, demografia, passaNoFiltro, vendasPorDia, paraCsv, arred };
