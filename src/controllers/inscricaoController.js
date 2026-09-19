const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');

// Inscrição de competidores nas competições da GEEKTOPIA.
//
// Casos de uso atendidos (PDF, seção 4.5.2.1):
//   o) Inscrever-se em Competições
//   p) Consultar Status da Análise dos Dados Enviados (Competidor)
//   x) Gerenciar Competidores (a parte de aprovar/reprovar inscrições)
//
// Regra de segurança: o competidor vem SEMPRE de req.userId. O usuário
// precisa ter perfil de Competidor (criado em /api/parceiros/competidor).

// Valores aceitos pelo enum StatusInscricaoCompeticaoEnum do schema.prisma.
const STATUS_VALIDOS = ['AguardandoPagamento', 'EmAnalise', 'Aprovado', 'Reprovado'];

// Enquanto está num destes, o competidor ainda pode mexer ou cancelar.
const STATUS_ABERTOS = ['AguardandoPagamento', 'EmAnalise'];

// Dados trazidos junto em toda consulta.
const INCLUIR = {
  competicao: {
    select: {
      id_competicao: true,
      nome_competicao: true,
      modalidade: true,
      valor_taxa_inscricao: true,
      id_geektopia: true
    }
  },
  equipe: { select: { id_equipe: true, nome_equipe: true } }
};

const paraNumero = (v) => (v === null || v === undefined ? null : Number(v));

// Monta a resposta: converte o Decimal da taxa que vem aninhado.
function montarResposta(i) {
  const r = { ...i };
  if (i.competicao) {
    r.competicao = { ...i.competicao, valor_taxa_inscricao: paraNumero(i.competicao.valor_taxa_inscricao) };
  }
  return r;
}

// Valida os links opcionais de apresentação. Só devolve o que veio no corpo.
function validarLinks(corpo) {
  const dados = {};

  for (const campo of ['url_portfolio_apresentacao', 'link_audio_apresentacao']) {
    if (corpo[campo] === undefined) continue;
    if (corpo[campo] === null) {
      dados[campo] = null;
      continue;
    }
    const valor = lerTexto(corpo[campo], 2000);
    if (valor === null) {
      return { erro: `O campo "${campo}" deve ser um texto de até 2000 caracteres.` };
    }
    dados[campo] = valor;
  }

  return { dados };
}

// Confere o vínculo opcional com uma equipe.
// A equipe precisa existir e pertencer à MESMA competição — igual à regra
// da programação com competição.
async function conferirEquipe(corpo, idCompeticao) {
  if (corpo.id_equipe === undefined || corpo.id_equipe === null) {
    return { valor: null };
  }

  const idEquipe = lerId(corpo.id_equipe);

  if (!idEquipe) {
    return { erro: 'O campo "id_equipe" deve ser um identificador válido.' };
  }

  const equipe = await prisma.equipe_Competicao.findUnique({
    where: { id_equipe: idEquipe },
    select: { id_competicao: true, nome_equipe: true }
  });

  if (!equipe) {
    return { erro: 'A equipe informada não existe.' };
  }

  if (equipe.id_competicao !== idCompeticao) {
    return {
      erro: `A equipe "${equipe.nome_equipe}" pertence a outra competição.`
    };
  }

  return { valor: idEquipe };
}

// POST /api/inscricoes - o competidor se inscreve numa competição
// Corpo: { id_competicao, id_equipe?, url_portfolio_apresentacao?, link_audio_apresentacao? }
exports.criar = async (req, res) => {
  try {
    const competidor = await prisma.competidor.findUnique({
      where: { id_usuario: req.userId },
      select: { id_usuario: true }
    });

    if (!competidor) {
      return res.status(403).json({
        error: 'Apenas usuários com perfil de competidor podem se inscrever. Crie o seu em /api/parceiros/competidor.'
      });
    }

    const idCompeticao = lerId(req.body.id_competicao);

    if (!idCompeticao) {
      return res.status(400).json({
        error: 'O campo "id_competicao" é obrigatório e deve ser um identificador válido.'
      });
    }

    const competicao = await prisma.competicao.findUnique({
      where: { id_competicao: idCompeticao },
      select: {
        modalidade: true,
        valor_taxa_inscricao: true,
        geektopia: { select: { status_evento: true } }
      }
    });

    if (!competicao) {
      return res.status(404).json({ error: 'A competição informada não existe.' });
    }

    // Edição em rascunho não aparece para o público; encerrada não aceita mais.
    if (competicao.geektopia.status_evento === 'Bloqueado') {
      return res.status(404).json({ error: 'A competição informada não existe.' });
    }

    if (competicao.geektopia.status_evento === 'Encerrado') {
      return res.status(409).json({
        error: 'Não é possível se inscrever: a edição desta competição já foi encerrada.'
      });
    }

    const jaExiste = await prisma.inscricao_Competicao.findFirst({
      where: {
        id_usuario: req.userId,
        id_competicao: idCompeticao,
        status_inscricao: { not: 'Reprovado' }
      },
      select: { id_inscricao: true, status_inscricao: true }
    });

    if (jaExiste) {
      return res.status(409).json({
        error: `Você já possui uma inscrição nesta competição (status: ${jaExiste.status_inscricao}).`,
        id_inscricao: jaExiste.id_inscricao
      });
    }

    const equipe = await conferirEquipe(req.body, idCompeticao);

    if (equipe.erro) {
      return res.status(400).json({ error: equipe.erro });
    }

    // Modalidade Solo não tem equipe; Dupla e Grupo precisam de uma.
    if (competicao.modalidade === 'Solo' && equipe.valor !== null) {
      return res.status(400).json({ error: 'Competição na modalidade Solo não aceita equipe.' });
    }

    const { erro, dados } = validarLinks(req.body);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    // Competição gratuita pula a etapa de pagamento e já entra em análise.
    // Com taxa, nasce aguardando pagamento — o módulo de pedidos muda depois.
    const taxa = paraNumero(competicao.valor_taxa_inscricao) || 0;
    const statusInicial = taxa > 0 ? 'AguardandoPagamento' : 'EmAnalise';

    const nova = await prisma.inscricao_Competicao.create({
      data: {
        ...dados,
        id_competicao: idCompeticao,
        id_usuario: req.userId,
        id_equipe: equipe.valor,
        status_inscricao: statusInicial
      },
      include: INCLUIR
    });

    return res.status(201).json({
      message:
        statusInicial === 'EmAnalise'
          ? 'Inscrição realizada! Aguarde a análise da organização.'
          : `Inscrição registrada! Falta o pagamento da taxa de R$ ${taxa.toFixed(2)}.`,
      inscricao: montarResposta(nova)
    });
  } catch (error) {
    console.error('Erro ao criar inscrição:', error);
    return res.status(500).json({ error: 'Erro ao realizar a inscrição.' });
  }
};

// GET /api/inscricoes/minhas - as inscrições de quem está logado
// Atende o caso de uso "p) Consultar Status da Análise".
exports.listarMinhas = async (req, res) => {
  try {
    const inscricoes = await prisma.inscricao_Competicao.findMany({
      where: { id_usuario: req.userId },
      include: INCLUIR,
      orderBy: { id_inscricao: 'desc' }
    });

    return res.json(inscricoes.map(montarResposta));
  } catch (error) {
    console.error('Erro ao listar inscrições do competidor:', error);
    return res.status(500).json({ error: 'Erro ao listar suas inscrições.' });
  }
};

// GET /api/inscricoes/:id - uma inscrição (dono ou admin)
exports.buscarPorId = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da inscrição é inválido.' });
    }

    const inscricao = await prisma.inscricao_Competicao.findUnique({
      where: { id_inscricao: id },
      include: INCLUIR
    });

    // 404 também para quem não é dono: não confirmamos que existe.
    if (!inscricao || (inscricao.id_usuario !== req.userId && req.userIsAdmin !== true)) {
      return res.status(404).json({ error: 'Inscrição não encontrada.' });
    }

    return res.json(montarResposta(inscricao));
  } catch (error) {
    console.error('Erro ao buscar inscrição:', error);
    return res.status(500).json({ error: 'Erro ao buscar a inscrição.' });
  }
};

// PUT /api/inscricoes/:id - o competidor ajusta os links de apresentação
// Só enquanto a inscrição ainda não foi decidida.
exports.atualizar = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da inscrição é inválido.' });
    }

    // Trocar de competição ou de status não é papel do competidor.
    if (req.body.id_competicao !== undefined || req.body.status_inscricao !== undefined) {
      return res.status(400).json({
        error: 'Não é permitido alterar a competição ou o status de uma inscrição.'
      });
    }

    const atual = await prisma.inscricao_Competicao.findUnique({
      where: { id_inscricao: id },
      select: { id_usuario: true, id_competicao: true, status_inscricao: true }
    });

    if (!atual || atual.id_usuario !== req.userId) {
      return res.status(404).json({ error: 'Inscrição não encontrada.' });
    }

    if (!STATUS_ABERTOS.includes(atual.status_inscricao)) {
      return res.status(409).json({
        error: `Esta inscrição já foi ${atual.status_inscricao === 'Aprovado' ? 'aprovada' : 'reprovada'} e não pode mais ser alterada.`
      });
    }

    const { erro, dados } = validarLinks(req.body);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    if (req.body.id_equipe !== undefined) {
      const equipe = await conferirEquipe(req.body, atual.id_competicao);
      if (equipe.erro) return res.status(400).json({ error: equipe.erro });
      dados.id_equipe = equipe.valor;
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const atualizada = await prisma.inscricao_Competicao.update({
      where: { id_inscricao: id },
      data: dados,
      include: INCLUIR
    });

    return res.json({ message: 'Inscrição atualizada!', inscricao: montarResposta(atualizada) });
  } catch (error) {
    console.error('Erro ao atualizar inscrição:', error);
    return res.status(500).json({ error: 'Erro ao atualizar a inscrição.' });
  }
};

// DELETE /api/inscricoes/:id - cancela a inscrição
// O competidor cancela a própria enquanto aberta; o admin remove qualquer uma.
exports.remover = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da inscrição é inválido.' });
    }

    const inscricao = await prisma.inscricao_Competicao.findUnique({
      where: { id_inscricao: id },
      select: { id_usuario: true, status_inscricao: true, id_pedido: true }
    });

    if (!inscricao) {
      return res.status(404).json({ error: 'Inscrição não encontrada.' });
    }

    const ehDono = inscricao.id_usuario === req.userId;
    const ehAdmin = req.userIsAdmin === true;

    if (!ehDono && !ehAdmin) {
      return res.status(404).json({ error: 'Inscrição não encontrada.' });
    }

    if (!ehAdmin && !STATUS_ABERTOS.includes(inscricao.status_inscricao)) {
      return res.status(409).json({
        error: 'Esta inscrição já foi analisada. Entre em contato com a organização para cancelá-la.'
      });
    }

    // Inscrição com pedido gerado tem histórico financeiro atrelado.
    if (inscricao.id_pedido !== null) {
      return res.status(409).json({
        error: 'Não é possível cancelar: esta inscrição já gerou um pedido de pagamento.'
      });
    }

    await prisma.inscricao_Competicao.delete({ where: { id_inscricao: id } });

    return res.json({ message: 'Inscrição cancelada com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover inscrição:', error);
    return res.status(500).json({ error: 'Erro ao cancelar a inscrição.' });
  }
};

// GET /api/inscricoes/admin/todas - fila de análise da organização
// Aceita ?status=EmAnalise e ?id_competicao=3 como filtros.
exports.listarTodas = async (req, res) => {
  try {
    const filtro = {};

    if (req.query.status !== undefined) {
      if (!STATUS_VALIDOS.includes(req.query.status)) {
        return res.status(400).json({
          error: `O filtro "status" deve ser um destes: ${STATUS_VALIDOS.join(', ')}.`
        });
      }
      filtro.status_inscricao = req.query.status;
    }

    if (req.query.id_competicao !== undefined) {
      const idCompeticao = lerId(req.query.id_competicao);
      if (!idCompeticao) {
        return res.status(400).json({ error: 'O filtro "id_competicao" é inválido.' });
      }
      filtro.id_competicao = idCompeticao;
    }

    const inscricoes = await prisma.inscricao_Competicao.findMany({
      where: filtro,
      include: {
        ...INCLUIR,
        competidor: {
          select: {
            nickname_competidor: true,
            modalidade_principal: true,
            participante: {
              select: { usuario: { select: { nome_completo: true, email: true } } }
            }
          }
        }
      },
      // Em análise primeiro: é a fila de trabalho.
      orderBy: [{ status_inscricao: 'asc' }, { id_inscricao: 'desc' }]
    });

    return res.json(inscricoes.map(montarResposta));
  } catch (error) {
    console.error('Erro ao listar inscrições:', error);
    return res.status(500).json({ error: 'Erro ao listar as inscrições.' });
  }
};

// PATCH /api/inscricoes/admin/:id/status - a organização aprova ou reprova
// Atende a parte de inscrições do caso de uso "x) Gerenciar Competidores".
exports.alterarStatus = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da inscrição é inválido.' });
    }

    const { status_inscricao } = req.body;

    if (!STATUS_VALIDOS.includes(status_inscricao)) {
      return res.status(400).json({
        error: `O campo "status_inscricao" deve ser um destes: ${STATUS_VALIDOS.join(', ')}.`
      });
    }

    const existe = await prisma.inscricao_Competicao.findUnique({
      where: { id_inscricao: id },
      select: { id_inscricao: true }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Inscrição não encontrada.' });
    }

    const atualizada = await prisma.inscricao_Competicao.update({
      where: { id_inscricao: id },
      data: { status_inscricao },
      include: INCLUIR
    });

    return res.json({
      message: `Inscrição marcada como "${status_inscricao}".`,
      inscricao: montarResposta(atualizada)
    });
  } catch (error) {
    console.error('Erro ao alterar status da inscrição:', error);
    return res.status(500).json({ error: 'Erro ao alterar o status da inscrição.' });
  }
};
