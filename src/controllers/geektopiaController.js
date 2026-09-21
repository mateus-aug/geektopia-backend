const prisma = require('../config/prisma');
const { Prisma } = require('@prisma/client');
const { lerId, lerData, lerTexto } = require('../utils/validadores');

// Status que o público pode enxergar. 'Bloqueado' é rascunho da diretoria.
const STATUS_PUBLICOS = ['VendasAbertas', 'VendasEncerradas', 'Encerrado'];

// Todos os valores aceitos pelo enum StatusEventoEnum do schema.prisma.
const STATUS_VALIDOS = ['Bloqueado', ...STATUS_PUBLICOS];

// Campos da listagem. Textos longos ficam de fora para aliviar a resposta.
const CAMPOS_DA_LISTA = {
  id_geektopia: true,
  nome_edicao: true,
  data_inicio: true,
  data_fim: true,
  local: true,
  banner_url: true,
  status_evento: true,
  tipo_edicao: true,
  tagline: true,
  cor_destaque: true,
  banner_fundo: true,
  classificacao_etaria: true
};

const COR_HEX = /^#[0-9a-fA-F]{6}$/;
const FUNDO_BANNER = /^#[0-9a-fA-F]{6}(,#[0-9a-fA-F]{6}(,(?:[0-9]|[1-9][0-9]|[12][0-9]{2}|3[0-5][0-9]|360))?)?$/;

// Classificação indicativa brasileira: 0 = livre. Mesmos valores do CHECK do banco.
const CLASSIFICACOES = [0, 10, 12, 14, 16, 18];
const MAX_DESTAQUES = 6;

// Valida a lista de destaques: [{ titulo, descricao }]. O JSON vai direto
// para a vitrine pública, então o formato é conferido item a item.
function validarDestaques(valor) {
  if (valor === null) return { valor: null };

  if (!Array.isArray(valor) || valor.length > MAX_DESTAQUES) {
    return { erro: `O campo "destaques" deve ser uma lista com até ${MAX_DESTAQUES} itens.` };
  }

  const itens = [];
  for (const item of valor) {
    const titulo = lerTexto(item && item.titulo, 80);
    if (!titulo) {
      return { erro: 'Cada destaque precisa de um "titulo" com até 80 caracteres.' };
    }
    const descricao = item.descricao === undefined || item.descricao === '' ? null : lerTexto(item.descricao, 300);
    if (item.descricao && !descricao) {
      return { erro: 'A "descricao" de um destaque deve ter até 300 caracteres.' };
    }
    itens.push({ titulo, descricao });
  }
  return { valor: itens };
}

// Valida os campos enviados. Só devolve o que veio no corpo, para o PUT
// conseguir alterar um campo sem apagar os outros.
function validarDados(corpo, ehCriacao) {
  const dados = {};

  if (ehCriacao || corpo.nome_edicao !== undefined) {
    const nome = lerTexto(corpo.nome_edicao, 150);
    if (!nome) {
      return { erro: 'O campo "nome_edicao" é obrigatório e deve ter até 150 caracteres.' };
    }
    dados.nome_edicao = nome;
  }

  if (corpo.data_inicio !== undefined) {
    const inicio = lerData(corpo.data_inicio);
    if (!inicio) {
      return { erro: 'O campo "data_inicio" deve ser uma data válida (ex.: 2027-11-20).' };
    }
    // Regra do Quadro 10 aplicada só na criação: editar um evento em
    // andamento continua permitido.
    if (ehCriacao && inicio <= new Date()) {
      return { erro: 'A data de início do evento deve ser futura.' };
    }
    dados.data_inicio = inicio;
  }

  if (corpo.data_fim !== undefined) {
    const fim = lerData(corpo.data_fim);
    if (!fim) {
      return { erro: 'O campo "data_fim" deve ser uma data válida (ex.: 2027-11-22).' };
    }
    dados.data_fim = fim;
  }

  if (dados.data_inicio && dados.data_fim && dados.data_fim <= dados.data_inicio) {
    return { erro: 'A data de fim deve ser posterior à data de início.' };
  }

  if (corpo.local !== undefined) dados.local = lerTexto(corpo.local, 200);
  if (corpo.descricao !== undefined) dados.descricao = lerTexto(corpo.descricao, 10000);
  if (corpo.banner_url !== undefined) dados.banner_url = lerTexto(corpo.banner_url, 2000);
  if (corpo.regras_idade_minima !== undefined) {
    dados.regras_idade_minima = lerTexto(corpo.regras_idade_minima, 2000);
  }
  if (corpo.objetos_proibidos !== undefined) {
    dados.objetos_proibidos = lerTexto(corpo.objetos_proibidos, 3000);
  }
  if (corpo.aviso_documentacao !== undefined) {
    dados.aviso_documentacao = lerTexto(corpo.aviso_documentacao, 2000);
  }

  // Vem como número (JSON) ou texto (multipart). Vazio/null limpa: "não informada".
  if (corpo.classificacao_etaria !== undefined) {
    if (corpo.classificacao_etaria === null || corpo.classificacao_etaria === '') {
      dados.classificacao_etaria = null;
    } else {
      const faixa = Number(corpo.classificacao_etaria);
      if (!CLASSIFICACOES.includes(faixa)) {
        return { erro: `O campo "classificacao_etaria" deve ser um destes: ${CLASSIFICACOES.join(', ')} (0 = livre).` };
      }
      dados.classificacao_etaria = faixa;
    }
  }

  // Conteúdo da vitrine. Texto vazio ou null limpa o campo; passar do limite
  // é erro (não some em silêncio).
  for (const [campo, limite] of [['tagline', 200], ['texto_sobre', 10000]]) {
    if (corpo[campo] !== undefined) {
      const texto = typeof corpo[campo] === 'string' ? corpo[campo].trim() : '';
      if (texto.length > limite) {
        return { erro: `O campo "${campo}" deve ter no máximo ${limite} caracteres.` };
      }
      dados[campo] = texto === '' ? null : texto;
    }
  }

  if (corpo.cor_destaque !== undefined) {
    if (corpo.cor_destaque === null || corpo.cor_destaque === '') {
      dados.cor_destaque = null;
    } else if (typeof corpo.cor_destaque !== 'string' || !COR_HEX.test(corpo.cor_destaque)) {
      return { erro: 'O campo "cor_destaque" deve ser uma cor hexadecimal (ex.: #F7C531).' };
    } else {
      dados.cor_destaque = corpo.cor_destaque.toUpperCase();
    }
  }

  if (corpo.banner_fundo !== undefined) {
    if (corpo.banner_fundo === null || corpo.banner_fundo === '') {
      dados.banner_fundo = null;
    } else if (typeof corpo.banner_fundo !== 'string' || !FUNDO_BANNER.test(corpo.banner_fundo)) {
      return { erro: 'O campo "banner_fundo" deve ser uma cor (#RRGGBB) ou um gradiente (#RRGGBB,#RRGGBB ou #RRGGBB,#RRGGBB,ângulo).' };
    } else {
      dados.banner_fundo = corpo.banner_fundo.toUpperCase();
    }
  }

  if (corpo.destaques !== undefined) {
    const r = validarDestaques(corpo.destaques);
    if (r.erro) return { erro: r.erro };
    // Json nulo no Prisma exige um valor especial, não o null comum.
    dados.destaques = r.valor === null ? Prisma.DbNull : r.valor;
  }

  if (corpo.status_evento !== undefined) {
    if (!STATUS_VALIDOS.includes(corpo.status_evento)) {
      return { erro: `O campo "status_evento" deve ser um destes: ${STATUS_VALIDOS.join(', ')}.` };
    }
    dados.status_evento = corpo.status_evento;
  }

  if (corpo.qnt_dias !== undefined) {
    const dias = Number(corpo.qnt_dias);
    if (!Number.isInteger(dias) || dias <= 0) {
      return { erro: 'O campo "qnt_dias" deve ser um número inteiro maior que zero.' };
    }
    dados.qnt_dias = dias;
  }

  return { dados };
}

// GET /api/geektopia - lista as edições visíveis ao público
exports.listarPublicas = async (req, res) => {
  try {
    const edicoes = await prisma.geektopia.findMany({
      where: { status_evento: { in: STATUS_PUBLICOS } },
      select: CAMPOS_DA_LISTA,
      orderBy: { data_inicio: { sort: 'desc', nulls: 'last' } }
    });

    return res.json(edicoes);
  } catch (error) {
    console.error('Erro ao listar edições da Geektopia:', error);
    return res.status(500).json({ error: 'Erro ao listar as edições da Geektopia.' });
  }
};

// GET /api/geektopia/:id - detalhes de uma edição
// Também atende /api/geektopia/admin/:id, onde o admin enxerga rascunhos.
exports.buscarPorId = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da edição é inválido.' });
    }

    const edicao = await prisma.geektopia.findUnique({
      where: { id_geektopia: id }
    });

    // 404 também para rascunho: não confirmamos nem que a edição existe.
    const visivel = edicao && (STATUS_PUBLICOS.includes(edicao.status_evento) || req.userIsAdmin === true);

    if (!visivel) {
      return res.status(404).json({ error: 'Edição da Geektopia não encontrada.' });
    }

    return res.json(edicao);
  } catch (error) {
    console.error('Erro ao buscar edição da Geektopia:', error);
    return res.status(500).json({ error: 'Erro ao buscar a edição da Geektopia.' });
  }
};

// GET /api/geektopia/admin/todas - lista tudo, inclusive rascunhos
exports.listarTodas = async (req, res) => {
  try {
    const edicoes = await prisma.geektopia.findMany({
      select: {
        ...CAMPOS_DA_LISTA,
        _count: { select: { lotes: true, ingressos: true, competicoes: true } }
      },
      orderBy: { data_inicio: { sort: 'desc', nulls: 'last' } }
    });

    return res.json(edicoes);
  } catch (error) {
    console.error('Erro ao listar todas as edições:', error);
    return res.status(500).json({ error: 'Erro ao listar as edições da Geektopia.' });
  }
};

// O Principal que perde o posto vira 'PrincipalAnterior' (edição passada do
// evento anual), não Pocket: assim ele não se mistura às edições menores.
// Continua totalmente editável pelo admin (programação, fotos, convidados...).
async function rebaixarPrincipalAtual(tx) {
  return tx.geektopia.updateMany({
    where: { tipo_edicao: 'Principal' },
    data: { tipo_edicao: 'PrincipalAnterior' }
  });
}

// POST /api/geektopia - cadastra uma edição nova
// POST /api/geektopia - cadastra uma edição nova
exports.criar = async (req, res) => {
  try {
    const { erro, dados } = validarDados(req.body, true);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    // Evento recém-criado nunca tem lote ainda — abrir vendas aqui seria
    // sempre inválido. Mesma regra que já existe no alterarStatus.
    if (dados.status_evento === 'VendasAbertas') {
      return res.status(409).json({
        error: 'Não é possível abrir as vendas na criação do evento. Cadastre os lotes de ingresso primeiro, depois abra as vendas na tela de gerenciamento.'
      });
    }

    if (req.file) {
      dados.banner_url = `${req.protocol}://${req.get('host')}/uploads/eventos/${req.file.filename}`;
    }

    const marcarPrincipal = req.body.tornar_principal === 'true';

    let nova;
    if (marcarPrincipal) {
      nova = await prisma.$transaction(async (tx) => {
        await rebaixarPrincipalAtual(tx);
        return tx.geektopia.create({ data: { ...dados, tipo_edicao: 'Principal' } });
      });
    } else {
      nova = await prisma.geektopia.create({ data: dados });
    }

    return res.status(201).json({
      message: 'Edição da Geektopia cadastrada com sucesso!',
      geektopia: nova
    });
  } catch (error) {
    console.error('Erro ao cadastrar edição da Geektopia:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar a edição da Geektopia.' });
  }
};

// PUT /api/geektopia/:id - atualiza os campos enviados
exports.atualizar = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da edição é inválido.' });
    }

    const { erro, dados } = validarDados(req.body, false);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const atual = await prisma.geektopia.findUnique({
      where: { id_geektopia: id },
      select: { data_inicio: true, data_fim: true }
    });

    if (!atual) {
      return res.status(404).json({ error: 'Edição da Geektopia não encontrada.' });
    }

    // Se só uma das datas veio no corpo, compara com a que já está no banco.
    const inicio = dados.data_inicio !== undefined ? dados.data_inicio : atual.data_inicio;
    const fim = dados.data_fim !== undefined ? dados.data_fim : atual.data_fim;

    if (inicio && fim && fim <= inicio) {
      return res.status(400).json({ error: 'A data de fim deve ser posterior à data de início.' });
    }

    const atualizada = await prisma.geektopia.update({
      where: { id_geektopia: id },
      data: dados
    });

    return res.json({
      message: 'Edição da Geektopia atualizada com sucesso!',
      geektopia: atualizada
    });
  } catch (error) {
    console.error('Erro ao atualizar edição da Geektopia:', error);
    return res.status(500).json({ error: 'Erro ao atualizar a edição da Geektopia.' });
  }
};

// PATCH /api/geektopia/:id/status - abre ou encerra as vendas
exports.alterarStatus = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da edição é inválido.' });
    }

    const { status_evento } = req.body;

    if (!STATUS_VALIDOS.includes(status_evento)) {
      return res.status(400).json({
        error: `O campo "status_evento" deve ser um destes: ${STATUS_VALIDOS.join(', ')}.`
      });
    }

    const edicao = await prisma.geektopia.findUnique({
      where: { id_geektopia: id },
      select: { _count: { select: { lotes: true } } }
    });

    if (!edicao) {
      return res.status(404).json({ error: 'Edição da Geektopia não encontrada.' });
    }

    // Abrir vendas sem lote levaria o visitante a uma vitrine vazia.
    if (status_evento === 'VendasAbertas' && edicao._count.lotes === 0) {
      return res.status(409).json({
        error: 'Não é possível abrir as vendas: nenhum lote de ingressos foi cadastrado para esta edição.'
      });
    }

    const atualizada = await prisma.geektopia.update({
      where: { id_geektopia: id },
      data: { status_evento }
    });

    return res.json({
      message: `Status da edição alterado para "${status_evento}".`,
      geektopia: atualizada
    });
  } catch (error) {
    console.error('Erro ao alterar status da edição:', error);
    return res.status(500).json({ error: 'Erro ao alterar o status da edição.' });
  }
};

// PATCH /api/geektopia/:id/tornar-principal - marca uma edição como Principal,
// e rebaixa automaticamente a que já era (garante só 1 Principal por vez)
// PATCH /api/geektopia/:id/tornar-principal
exports.tornarPrincipal = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da edição é inválido.' });
    }

    const edicao = await prisma.geektopia.findUnique({
      where: { id_geektopia: id },
      select: { id_geektopia: true }
    });

    if (!edicao) {
      return res.status(404).json({ error: 'Edição da Geektopia não encontrada.' });
    }

    const promovida = await prisma.$transaction(async (tx) => {
      await rebaixarPrincipalAtual(tx);
      return tx.geektopia.update({
        where: { id_geektopia: id },
        data: { tipo_edicao: 'Principal' }
      });
    });

    return res.json({
      message: `"${promovida.nome_edicao}" agora é a Geektopia principal.`,
      geektopia: promovida
    });
  } catch (error) {
    console.error('Erro ao definir edição principal:', error);
    return res.status(500).json({ error: 'Erro ao definir a edição principal.' });
  }
};

// DELETE /api/geektopia/:id - remove uma edição sem vínculos
exports.remover = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da edição é inválido.' });
    }

    const edicao = await prisma.geektopia.findUnique({
      where: { id_geektopia: id },
      select: {
        _count: {
          select: {
            lotes: true,
            ingressos: true,
            competicoes: true,
            programacoes: true,
            credenciais: true,
            feedbacks: true,
            solicitacoesEspaco: true
          }
        }
      }
    });

    if (!edicao) {
      return res.status(404).json({ error: 'Edição da Geektopia não encontrada.' });
    }

    // Nenhuma relação usa onDelete: Cascade, então apagar destruiria histórico.
    const vinculos = Object.values(edicao._count).reduce((soma, qtd) => soma + qtd, 0);

    if (vinculos > 0) {
      return res.status(409).json({
        error:
          'Não é possível excluir esta edição porque existem registros vinculados a ela. ' +
          'Considere alterar o status para "Encerrado" em vez de excluir.',
        vinculos: edicao._count
      });
    }

    await prisma.geektopia.delete({ where: { id_geektopia: id } });

    return res.json({ message: 'Edição da Geektopia removida com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover edição da Geektopia:', error);
    return res.status(500).json({ error: 'Erro ao remover a edição da Geektopia.' });
  }
};

exports.uploadBanner = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da edição é inválido.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
    }

    const bannerUrl = `${req.protocol}://${req.get('host')}/uploads/eventos/${req.file.filename}`;

    const atualizada = await prisma.geektopia.update({
      where: { id_geektopia: id },
      data: { banner_url: bannerUrl }
    });

    return res.json({ message: 'Foto do evento atualizada com sucesso!', geektopia: atualizada });
  } catch (error) {
    console.error('Erro ao enviar banner do evento:', error);
    return res.status(500).json({ error: 'Erro ao enviar a foto do evento.' });
  }
};