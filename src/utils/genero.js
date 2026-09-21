// Gênero e sexualidade: valores fixos (para o relatório de público fazer sentido) e um "Outro" com texto livre.
//   gênero: obrigatório no cadastro.  sexualidade: opcional, informada pela própria pessoa no perfil.

const GENEROS = ['Feminino', 'Masculino', 'Não binário', 'Outro', 'Prefiro não informar'];
const SEXUALIDADES = ['Heterossexual', 'Homossexual', 'Bissexual', 'Pansexual', 'Assexual', 'Outra', 'Prefiro não informar'];
const MAX_TEXTO = 50; // tamanho da coluna

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Aceita um valor da lista ou "<Outro|Outra>: texto". Devolve { valor } (normalizado) ou { erro }.
function validarLista(bruto, lista, rotuloOutro, nomeCampo) {
  const texto = typeof bruto === 'string' ? bruto.trim().replace(/\s+/g, ' ') : '';
  if (!texto) return { valor: null };
  if (lista.includes(texto)) return { valor: texto };
  const m = texto.match(new RegExp(`^${rotuloOutro}:\\s*(.+)$`));
  if (m) {
    const detalhe = m[1].trim();
    if (!/^[\p{L}\p{N}\s'./-]+$/u.test(detalhe)) return { erro: `Em "${nomeCampo}", o texto de "${rotuloOutro}" só pode ter letras, números e espaços.` };
    const final = `${rotuloOutro}: ${detalhe}`;
    if (final.length > MAX_TEXTO) return { erro: `Em "${nomeCampo}", o texto de "${rotuloOutro}" deve ter até ${MAX_TEXTO - rotuloOutro.length - 2} caracteres.` };
    return { valor: final };
  }
  return { erro: `Escolha uma das opções de ${nomeCampo}.` };
}

const validarGenero = (v) => validarLista(v, GENEROS, 'Outro', 'gênero');
const validarSexualidade = (v) => validarLista(v, SEXUALIDADES, 'Outra', 'sexualidade');

// ---- Classificação para RELATÓRIOS (aceita também os textos livres antigos, sem alterar o banco)
function categoriaGenero(v) {
  const t = semAcento(v);
  if (!t) return 'Não informado';
  if (t.startsWith('outro')) return 'Outro';
  if (t.startsWith('prefiro')) return 'Prefiro não informar';
  if (/^(feminino|mulher|mulher cis|mulher trans|f)$/.test(t)) return 'Feminino';
  if (/^(masculino|homem|homem cis|homem trans|m)$/.test(t)) return 'Masculino';
  if (/(nao.?binari|bigenero|genero fluido|agenero|nb)/.test(t)) return 'Não binário';
  return 'Outro';
}

function categoriaSexualidade(v) {
  const t = semAcento(v);
  if (!t) return 'Não informada';
  if (t.startsWith('prefiro')) return 'Prefiro não informar';
  for (const s of ['heterossexual', 'homossexual', 'bissexual', 'pansexual', 'assexual']) if (t.startsWith(s)) return s[0].toUpperCase() + s.slice(1);
  return 'Outra';
}

const CATEGORIAS_GENERO = [...GENEROS, 'Não informado'];
const CATEGORIAS_SEXUALIDADE = [...SEXUALIDADES, 'Não informada'];

module.exports = { GENEROS, SEXUALIDADES, validarGenero, validarSexualidade, categoriaGenero, categoriaSexualidade, CATEGORIAS_GENERO, CATEGORIAS_SEXUALIDADE };
