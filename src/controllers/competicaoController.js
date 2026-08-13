const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');

// Status de edição que o público pode enxergar. Se a edição está 'Bloqueado',
// as competições dela também ficam invisíveis.
const STATUS_PUBLICOS = ['VendasAbertas', 'VendasEncerradas', 'Encerrado'];

// Valores aceitos pelo enum ModalidadeCompeticaoEnum do schema.prisma.
const MODALIDADES = ['Solo', 'Dupla', 'Grupo'];

// DECIMAL(10,2) comporta no máximo 8 dígitos antes da vírgula.
const VALOR_MAXIMO = 100000000;

// Monta a resposta de uma competição.
//
// `valor_taxa_inscricao` é DECIMAL(10,2) e o Prisma o devolve como objeto
// Decimal, que não vira número comum no JSON. Precisa de conversão explícita.
// O teste de null vem antes porque Number(null) daria zero, transformando
// "taxa não informada" em "competição gratuita".
function montarResposta(competicao) {
  const { _count, ...campos } = competicao;

  const resposta = {
    ...campos,
    valor_taxa_inscricao:
      competicao.valor_taxa_inscricao === null ? null : Number(competicao.valor_taxa_inscricao)
  };

  if (_count) {
    resposta.qtd_atividades_na_grade = _count.programacoes;
    resposta.qtd_equipes = _count.equipes;
    resposta.qtd_inscricoes = _count.inscricoes;
  }

  return resposta;
}

// Valida os campos próprios da competição. A chave estrangeira não entra aqui:
// conferir se a edição existe exige ir ao banco, e esta função é síncrona.
function validarDados(corpo, ehCriacao) {
  const dados = {};

  // O schema permite nome nulo, mas competição sem nome não tem como ser
  // apresentada ao público. Exigimos no cadastro.
  if (ehCriacao || corpo.nome_competicao !== undefined) {
    const nome = lerTexto(corpo.nome_competicao, 100);
    if (!nome) {
      return { erro: 'O campo "nome_competicao" é obrigatório e deve ter até 100 caracteres.' };
    }
    dados.nome_competicao = nome;
  }

  if (corpo.modalidade !== undefined) {
    // null limpa a modalidade, que é opcional no schema.
    if (corpo.modalidade === null) {
      dados.modalidade = null;
    } else if (!MODALIDADES.includes(corpo.modalidade)) {
      return { erro: `O campo "modalidade" deve ser um destes: ${MODALIDADES.join(', ')}.` };
    } else {
      dados.modalidade = corpo.modalidade;
    }
  }

  if (corpo.valor_taxa_inscricao !== undefined) {
    // null ou ausência significa competição sem taxa.
    if (corpo.valor_taxa_inscricao === null) {
      dados.valor_taxa_inscricao = null;
    } else {
      const valor = Number(corpo.valor_taxa_inscricao);

      // Aqui o zero é aceito, diferente do lote: competição gratuita existe.
      if (!Number.isFinite(valor) || valor < 0) {
        return { erro: 'O campo "valor_taxa_inscricao" deve ser um número maior ou igual a zero.' };
      }

      const arredondado = Math.round(valor * 100) / 100;

      if (arredondado >= VALOR_MAXIMO) {
        return { erro: 'O campo "valor_taxa_inscricao" excede o valor máximo permitido.' };
      }

      dados.valor_taxa_inscricao = arredondado;
    }
  }

  if (corpo.regras_url !== undefined) {
    dados.regras_url = corpo.regras_url === null ? null : lerTexto(corpo.regras_url, 2000);
  }

  return { dados };
}

// GET /api/geektopia/:id/competicoes - competições de uma edição
// Rota aninhada: competição só existe no contexto de um evento.
exports.listarPorGeektopia = async (req, res) => {
  try {
    const idGeektopia = lerId(req.params.id);

    if (!idGeektopia) {
      return res.status(400).json({ error: 'O identificador da edição é inválido.' });
    }

    const edicao = await prisma.geektopia.findUnique({
      where: { id_geektopia: idGeektopia },
      select: { status_evento: true }
    });

    // 404 também para rascunho: não confirmamos nem que a edição existe.
    const visivel = edicao && (STATUS_PUBLICOS.includes(edicao.status_evento) || req.userIsAdmin === true);

    if (!visivel) {
      return res.status(404).json({ error: 'Edição da Geektopia não encontrada.' });
    }

    const competicoes = await prisma.competicao.findMany({
      where: { id_geektopia: idGeektopia },
      orderBy: { nome_competicao: 'asc' }
    });

    return res.json(competicoes.map(montarResposta));
  } catch (error) {
    console.error('Erro ao listar competições da edição:', error);
    return res.status(500).json({ error: 'Erro ao listar as competições.' });
  }
};

// GET /api/competicoes/:id - uma competição específica
exports.buscarPorId = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da competição é inválido.' });
    }

    const competicao = await prisma.competicao.findUnique({
      where: { id_competicao: id },
      include: {
        geektopia: {
          select: { id_geektopia: true, nome_edicao: true, status_evento: true }
        },
        _count: { select: { programacoes: true, equipes: true, inscricoes: true } }
      }
    });

    const visivel =
      competicao &&
      (STATUS_PUBLICOS.includes(competicao.geektopia.status_evento) || req.userIsAdmin === true);

    if (!visivel) {
      return res.status(404).json({ error: 'Competição não encontrada.' });
    }

    return res.json(montarResposta(competicao));
  } catch (error) {
    console.error('Erro ao buscar competição:', error);
    return res.status(500).json({ error: 'Erro ao buscar a competição.' });
  }
};

// POST /api/competicoes - cadastra uma competição numa edição
// Corpo: { id_geektopia, nome_competicao, modalidade?, valor_taxa_inscricao?, regras_url? }
exports.criar = async (req, res) => {
  try {
    // Quadro 43 - "Impedir competição sem Geektopia vinculada".
    const idGeektopia = lerId(req.body.id_geektopia);

    if (!idGeektopia) {
      return res.status(400).json({
        error: 'O campo "id_geektopia" é obrigatório e deve ser um identificador válido.'
      });
    }

    const edicao = await prisma.geektopia.findUnique({
      where: { id_geektopia: idGeektopia },
      select: { status_evento: true }
    });

    if (!edicao) {
      return res.status(404).json({
        error: 'Não é possível cadastrar a competição: a edição da Geektopia informada não existe.'
      });
    }

    // Edição encerrada é histórico e não deve receber competições novas.
    if (edicao.status_evento === 'Encerrado') {
      return res.status(409).json({
        error: 'Não é possível cadastrar competições em uma edição já encerrada.'
      });
    }

    const { erro, dados } = validarDados(req.body, true);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    const nova = await prisma.competicao.create({
      data: { ...dados, id_geektopia: idGeektopia }
    });

    return res.status(201).json({
      message: 'Competição cadastrada com sucesso!',
      competicao: montarResposta(nova)
    });
  } catch (error) {
    console.error('Erro ao cadastrar competição:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar a competição.' });
  }
};

// PUT /api/competicoes/:id - atualiza os campos enviados
exports.atualizar = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da competição é inválido.' });
    }

    // Mover a competição de edição deixaria as atividades da grade e as
    // inscrições apontando para o evento errado.
    if (req.body.id_geektopia !== undefined) {
      return res.status(400).json({
        error: 'Não é permitido mover uma competição para outra edição da Geektopia.'
      });
    }

    const { erro, dados } = validarDados(req.body, false);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const atual = await prisma.competicao.findUnique({
      where: { id_competicao: id },
      select: { id_competicao: true, _count: { select: { inscricoes: true } } }
    });

    if (!atual) {
      return res.status(404).json({ error: 'Competição não encontrada.' });
    }

    // Mudar a taxa depois que gente já se inscreveu criaria divergência entre
    // o valor cobrado e o valor cadastrado.
    if (dados.valor_taxa_inscricao !== undefined && atual._count.inscricoes > 0) {
      return res.status(409).json({
        error:
          `Não é possível alterar a taxa de inscrição: já existem ${atual._count.inscricoes} ` +
          'inscrição(ões) feitas com o valor atual.'
      });
    }

    const atualizada = await prisma.competicao.update({
      where: { id_competicao: id },
      data: dados
    });

    return res.json({
      message: 'Competição atualizada com sucesso!',
      competicao: montarResposta(atualizada)
    });
  } catch (error) {
    console.error('Erro ao atualizar competição:', error);
    return res.status(500).json({ error: 'Erro ao atualizar a competição.' });
  }
};

// DELETE /api/competicoes/:id - remove uma competição
//
// Comportamento das chaves estrangeiras nesta tabela (visto na migration):
//   Equipe_Competicao    -> ON DELETE RESTRICT  (o banco bloqueia)
//   Inscricao_Competicao -> ON DELETE RESTRICT  (o banco bloqueia)
//   Programacao          -> ON DELETE SET NULL  (desvincula em silêncio)
//
// Os dois primeiros viram 409 com mensagem clara. O terceiro é permitido -
// a atividade continua existindo na grade, só deixa de ser marcada como
// competição - mas informamos quantas foram afetadas para não parecer magia.
exports.remover = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da competição é inválido.' });
    }

    const competicao = await prisma.competicao.findUnique({
      where: { id_competicao: id },
      select: { _count: { select: { equipes: true, inscricoes: true, programacoes: true } } }
    });

    if (!competicao) {
      return res.status(404).json({ error: 'Competição não encontrada.' });
    }

    const { equipes, inscricoes, programacoes } = competicao._count;

    if (equipes > 0 || inscricoes > 0) {
      return res.status(409).json({
        error:
          'Não é possível excluir esta competição porque já existem equipes ou inscrições ' +
          'vinculadas a ela.',
        vinculos: { equipes, inscricoes }
      });
    }

    await prisma.competicao.delete({ where: { id_competicao: id } });

    return res.json({
      message: 'Competição removida com sucesso!',
      atividades_desvinculadas: programacoes,
      aviso:
        programacoes > 0
          ? `${programacoes} atividade(s) da programação continuam na grade, mas deixaram de estar vinculadas a uma competição.`
          : undefined
    });
  } catch (error) {
    console.error('Erro ao remover competição:', error);
    return res.status(500).json({ error: 'Erro ao remover a competição.' });
  }
};
