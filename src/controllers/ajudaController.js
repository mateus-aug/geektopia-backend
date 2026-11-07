const { PUBLICOS, CATEGORIAS, ARTIGOS } = require('../utils/catalogoAjuda');

// Sistema de Ajuda: guia de uso da plataforma.
//
// Não consulta o banco. O conteúdo é estático (src/utils/catalogoAjuda.js), o
// que traz duas vantagens: responde instantaneamente e continua funcionando
// mesmo com o banco fora do ar — justamente quando a pessoa mais precisa de
// orientação.
//
// Artigos marcados para o público 'admin' só são devolvidos quando quem pede
// está logado como administrador. As rotas são públicas, mas passam por um
// leitor de token opcional que preenche req.userIsAdmin quando há sessão.

// Tira acentos e baixa a caixa, para a busca achar "competicao" quando a
// pessoa digita "Competição" e vice-versa.
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Decide se um artigo pode ser mostrado a quem está pedindo.
//
// Um artigo só é restrito quando TODOS os seus públicos são 'admin'. Artigos
// como 'esqueci-senha' listam admin junto com visitante porque servem aos dois
// — esconder esses de quem não está logado seria o oposto do que a ajuda deve
// fazer.
const visivelPara = (artigo, ehAdmin) =>
  ehAdmin || artigo.publicos.some((p) => p !== 'admin');

// Versão curta, para listagens e resultados de busca.
const resumir = (a) => ({
  id: a.id,
  titulo: a.titulo,
  categoria: a.categoria,
  publicos: a.publicos,
  resumo: a.resumo
});

// Monta o artigo completo, trocando os ids de "relacionados" pelos títulos —
// assim o front consegue desenhar os links sem fazer outra chamada.
function detalhar(artigo, ehAdmin) {
  const relacionados = (artigo.relacionados || [])
    .map((id) => ARTIGOS.find((x) => x.id === id))
    .filter((x) => x && visivelPara(x, ehAdmin))
    .map((x) => ({ id: x.id, titulo: x.titulo, categoria: x.categoria }));

  return {
    id: artigo.id,
    titulo: artigo.titulo,
    categoria: artigo.categoria,
    publicos: artigo.publicos,
    resumo: artigo.resumo,
    passos: artigo.passos || [],
    observacoes: artigo.observacoes || [],
    relacionados
  };
}

// GET /api/ajuda
// Índice completo: públicos, categorias com os artigos de cada uma e alguns
// destaques. Uma chamada só monta a tela inteira de ajuda.
exports.indice = async (req, res) => {
  try {
    const ehAdmin = req.userIsAdmin === true;
    const disponiveis = ARTIGOS.filter((a) => visivelPara(a, ehAdmin));

    const categorias = CATEGORIAS
      .map((c) => ({
        ...c,
        artigos: disponiveis.filter((a) => a.categoria === c.id).map(resumir)
      }))
      // Categoria sem nenhum artigo visível não aparece (é o caso de
      // "Administração" para quem não é da equipe).
      .filter((c) => c.artigos.length > 0)
      .sort((a, b) => a.ordem - b.ordem);

    // Atalhos para as dúvidas mais comuns, na ordem em que a pessoa costuma
    // precisar delas.
    const destaques = ['criar-conta', 'comprar-ingresso', 'pagamento-nao-confirmou', 'entrar-no-evento']
      .map((id) => disponiveis.find((a) => a.id === id))
      .filter(Boolean)
      .map(resumir);

    return res.json({
      publicos: ehAdmin ? PUBLICOS : PUBLICOS.filter((p) => p.id !== 'admin'),
      categorias,
      destaques,
      total_artigos: disponiveis.length
    });
  } catch (error) {
    console.error('Erro ao montar o índice da ajuda:', error);
    return res.status(500).json({ error: 'Erro ao carregar a central de ajuda.' });
  }
};

// GET /api/ajuda/artigos
// Aceita ?categoria=ingressos e ?publico=expositor como filtros.
exports.listar = async (req, res) => {
  try {
    const ehAdmin = req.userIsAdmin === true;
    let lista = ARTIGOS.filter((a) => visivelPara(a, ehAdmin));

    if (req.query.categoria !== undefined) {
      const categoria = String(req.query.categoria);
      if (!CATEGORIAS.some((c) => c.id === categoria)) {
        return res.status(400).json({
          error: `Categoria inválida. Use uma destas: ${CATEGORIAS.map((c) => c.id).join(', ')}.`
        });
      }
      lista = lista.filter((a) => a.categoria === categoria);
    }

    if (req.query.publico !== undefined) {
      const publico = String(req.query.publico);
      if (!PUBLICOS.some((p) => p.id === publico)) {
        return res.status(400).json({
          error: `Público inválido. Use um destes: ${PUBLICOS.map((p) => p.id).join(', ')}.`
        });
      }
      lista = lista.filter((a) => a.publicos.includes(publico));
    }

    return res.json(lista.map(resumir));
  } catch (error) {
    console.error('Erro ao listar artigos da ajuda:', error);
    return res.status(500).json({ error: 'Erro ao listar os artigos de ajuda.' });
  }
};

// GET /api/ajuda/artigos/:id
exports.buscarPorId = async (req, res) => {
  try {
    const ehAdmin = req.userIsAdmin === true;
    const artigo = ARTIGOS.find((a) => a.id === String(req.params.id));

    // 404 também quando o artigo é de admin e quem pede não é: do lado de fora
    // não dá para distinguir "não existe" de "não é para você".
    if (!artigo || !visivelPara(artigo, ehAdmin)) {
      return res.status(404).json({ error: 'Artigo de ajuda não encontrado.' });
    }

    return res.json(detalhar(artigo, ehAdmin));
  } catch (error) {
    console.error('Erro ao buscar artigo da ajuda:', error);
    return res.status(500).json({ error: 'Erro ao carregar o artigo.' });
  }
};

// GET /api/ajuda/busca?q=texto
// Busca por título, resumo, passos, observações e palavras-chave.
// Pontua o que casa no título acima do que casa no meio do texto, para o
// resultado mais óbvio vir primeiro.
exports.buscar = async (req, res) => {
  try {
    const termo = normalizar(req.query.q);

    if (termo.length < 2) {
      return res.status(400).json({ error: 'Digite pelo menos 2 caracteres para buscar.' });
    }

    const ehAdmin = req.userIsAdmin === true;

    const resultados = ARTIGOS
      .filter((a) => visivelPara(a, ehAdmin))
      .map((a) => {
        let pontos = 0;

        if (normalizar(a.titulo).includes(termo)) pontos += 10;
        if ((a.termos || []).some((t) => normalizar(t).includes(termo))) pontos += 6;
        if (normalizar(a.resumo).includes(termo)) pontos += 3;
        if ((a.passos || []).some((p) => normalizar(p).includes(termo))) pontos += 1;
        if ((a.observacoes || []).some((o) => normalizar(o).includes(termo))) pontos += 1;

        return { artigo: a, pontos };
      })
      .filter((r) => r.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos)
      .map((r) => resumir(r.artigo));

    return res.json({
      termo: String(req.query.q).trim(),
      total: resultados.length,
      resultados,
      // Quando não acha nada, devolve as categorias para a pessoa navegar em
      // vez de ficar na tela vazia.
      sugestoes: resultados.length === 0
        ? CATEGORIAS.filter((c) => c.id !== 'administracao' || ehAdmin)
            .map((c) => ({ id: c.id, titulo: c.titulo }))
        : []
    });
  } catch (error) {
    console.error('Erro ao buscar na ajuda:', error);
    return res.status(500).json({ error: 'Erro ao realizar a busca.' });
  }
};
