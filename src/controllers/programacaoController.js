const prisma = require('../config/prisma');
const { lerId, lerData, lerTexto } = require('../utils/validadores');

// Status de edição que o público pode enxergar. Se a edição está 'Bloqueado',
// a grade de horários dela também fica invisível.
const STATUS_PUBLICOS = ['VendasAbertas', 'VendasEncerradas', 'Encerrado'];

// Dados da competição trazidos junto com a atividade, quando houver vínculo.
const RESUMO_COMPETICAO = {
  select: { id_competicao: true, nome_competicao: true, modalidade: true }
};

// Valida os campos próprios da atividade. As chaves estrangeiras não entram
// aqui: conferir se a edição e a competição existem exige ir ao banco, e esta
// função é síncrona de propósito.
function validarDados(corpo, ehCriacao) {
  const dados = {};

  if (ehCriacao || corpo.titulo_atividade !== undefined) {
    const titulo = lerTexto(corpo.titulo_atividade, 150);
    if (!titulo) {
      return { erro: 'O campo "titulo_atividade" é obrigatório e deve ter até 150 caracteres.' };
    }
    dados.titulo_atividade = titulo;
  }

  if (ehCriacao || corpo.data_hora_inicio !== undefined) {
    const inicio = lerData(corpo.data_hora_inicio);
    if (!inicio) {
      return {
        erro: 'O campo "data_hora_inicio" é obrigatório e deve ser uma data com hora válida (ex.: 2027-11-20T14:30:00).'
      };
    }
    // Regra do Quadro 19 aplicada só na criação: uma atividade que já
    // aconteceu precisa continuar editável (corrigir título, por exemplo).
    if (ehCriacao && inicio <= new Date()) {
      return { erro: 'A data e hora de início da atividade devem ser futuras.' };
    }
    dados.data_hora_inicio = inicio;
  }

  if (corpo.data_hora_fim !== undefined) {
    // Enviar null desmarca o horário de término, que é opcional no schema.
    if (corpo.data_hora_fim === null) {
      dados.data_hora_fim = null;
    } else {
      const fim = lerData(corpo.data_hora_fim);
      if (!fim) {
        return { erro: 'O campo "data_hora_fim" deve ser uma data com hora válida (ex.: 2027-11-20T16:00:00).' };
      }
      dados.data_hora_fim = fim;
    }
  }

  if (dados.data_hora_inicio && dados.data_hora_fim && dados.data_hora_fim <= dados.data_hora_inicio) {
    return { erro: 'O horário de término deve ser posterior ao de início.' };
  }

  return { dados };
}

// Confere o vínculo opcional com uma competição.
//
// Atende o Quadro 43 - "Validar vínculo entre programação e competição".
// A chave estrangeira do banco só garante que a competição EXISTE. Ela não
// impede vincular uma competição da edição de março à grade da edição de
// novembro, porque as duas são competições válidas. Por isso comparamos
// aqui a que edição a competição pertence.
//
// @returns {{erro: string|null, valor: number|null|undefined}}
//          `valor` indefinido significa "o campo não foi enviado".
async function conferirCompeticao(corpo, idGeektopia) {
  if (corpo.id_competicao === undefined) {
    return { valor: undefined };
  }

  // null desfaz o vínculo: a atividade deixa de ser uma competição.
  if (corpo.id_competicao === null) {
    return { valor: null };
  }

  const idCompeticao = lerId(corpo.id_competicao);

  if (!idCompeticao) {
    return { erro: 'O campo "id_competicao" deve ser um identificador válido ou null.' };
  }

  const competicao = await prisma.competicao.findUnique({
    where: { id_competicao: idCompeticao },
    select: { id_geektopia: true, nome_competicao: true }
  });

  if (!competicao) {
    return { erro: 'A competição informada não existe.' };
  }

  if (competicao.id_geektopia !== idGeektopia) {
    return {
      erro: `A competição "${competicao.nome_competicao || idCompeticao}" pertence a outra edição da Geektopia e não pode ser vinculada a esta atividade.`
    };
  }

  return { valor: idCompeticao };
}

// GET /api/geektopia/:id/programacao - grade de horários de uma edição
// Rota aninhada: a programação só faz sentido no contexto do evento.
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

    const atividades = await prisma.programacao.findMany({
      where: { id_geektopia: idGeektopia },
      include: { competicao: RESUMO_COMPETICAO },
      // Ordem cronológica: é assim que uma grade de horários se lê.
      orderBy: { data_hora_inicio: 'asc' }
    });

    return res.json(atividades);
  } catch (error) {
    console.error('Erro ao listar a programação da edição:', error);
    return res.status(500).json({ error: 'Erro ao listar a programação do evento.' });
  }
};

// GET /api/programacao/:id - uma atividade específica
exports.buscarPorId = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da atividade é inválido.' });
    }

    const atividade = await prisma.programacao.findUnique({
      where: { id_programacao: id },
      include: {
        competicao: RESUMO_COMPETICAO,
        geektopia: {
          select: { id_geektopia: true, nome_edicao: true, status_evento: true }
        }
      }
    });

    const visivel =
      atividade &&
      (STATUS_PUBLICOS.includes(atividade.geektopia.status_evento) || req.userIsAdmin === true);

    if (!visivel) {
      return res.status(404).json({ error: 'Atividade não encontrada na programação.' });
    }

    return res.json(atividade);
  } catch (error) {
    console.error('Erro ao buscar atividade da programação:', error);
    return res.status(500).json({ error: 'Erro ao buscar a atividade.' });
  }
};

// POST /api/programacao - cadastra uma atividade na grade
// Corpo: { id_geektopia, titulo_atividade, data_hora_inicio, data_hora_fim?, id_competicao? }
exports.criar = async (req, res) => {
  try {
    // Quadro 43 - "Impedir programação sem Geektopia vinculada".
    const idGeektopia = lerId(req.body.id_geektopia);

    if (!idGeektopia) {
      return res.status(400).json({
        error: 'O campo "id_geektopia" é obrigatório e deve ser um identificador válido.'
      });
    }

    const edicao = await prisma.geektopia.findUnique({
      where: { id_geektopia: idGeektopia },
      select: { id_geektopia: true }
    });

    if (!edicao) {
      return res.status(404).json({
        error: 'Não é possível cadastrar a atividade: a edição da Geektopia informada não existe.'
      });
    }

    const competicao = await conferirCompeticao(req.body, idGeektopia);

    if (competicao.erro) {
      return res.status(400).json({ error: competicao.erro });
    }

    const { erro, dados } = validarDados(req.body, true);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    const nova = await prisma.programacao.create({
      data: {
        ...dados,
        id_geektopia: idGeektopia,
        id_competicao: competicao.valor === undefined ? null : competicao.valor
      },
      include: { competicao: RESUMO_COMPETICAO }
    });

    return res.status(201).json({
      message: 'Atividade cadastrada na programação com sucesso!',
      programacao: nova
    });
  } catch (error) {
    console.error('Erro ao cadastrar atividade da programação:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar a atividade.' });
  }
};

// PUT /api/programacao/:id - atualiza os campos enviados
exports.atualizar = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da atividade é inválido.' });
    }

    // Mover a atividade de edição bagunçaria a grade das duas. Recusamos com
    // mensagem clara em vez de ignorar o campo em silêncio.
    if (req.body.id_geektopia !== undefined) {
      return res.status(400).json({
        error: 'Não é permitido mover uma atividade para outra edição da Geektopia.'
      });
    }

    const atual = await prisma.programacao.findUnique({
      where: { id_programacao: id },
      select: { id_geektopia: true, data_hora_inicio: true, data_hora_fim: true }
    });

    if (!atual) {
      return res.status(404).json({ error: 'Atividade não encontrada na programação.' });
    }

    // A competição precisa pertencer à MESMA edição da atividade já gravada.
    const competicao = await conferirCompeticao(req.body, atual.id_geektopia);

    if (competicao.erro) {
      return res.status(400).json({ error: competicao.erro });
    }

    const { erro, dados } = validarDados(req.body, false);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    if (competicao.valor !== undefined) {
      dados.id_competicao = competicao.valor;
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    // Se só um dos horários veio no corpo, compara com o que está no banco.
    const inicio = dados.data_hora_inicio !== undefined ? dados.data_hora_inicio : atual.data_hora_inicio;
    const fim = dados.data_hora_fim !== undefined ? dados.data_hora_fim : atual.data_hora_fim;

    if (inicio && fim && fim <= inicio) {
      return res.status(400).json({ error: 'O horário de término deve ser posterior ao de início.' });
    }

    const atualizada = await prisma.programacao.update({
      where: { id_programacao: id },
      data: dados,
      include: { competicao: RESUMO_COMPETICAO }
    });

    return res.json({
      message: 'Atividade atualizada com sucesso!',
      programacao: atualizada
    });
  } catch (error) {
    console.error('Erro ao atualizar atividade da programação:', error);
    return res.status(500).json({ error: 'Erro ao atualizar a atividade.' });
  }
};

// DELETE /api/programacao/:id - remove uma atividade
// Diferente da edição e do lote, aqui não há bloqueio: nenhuma outra tabela
// aponta para Programacao, então apagar não destrói histórico de ninguém.
exports.remover = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da atividade é inválido.' });
    }

    const atividade = await prisma.programacao.findUnique({
      where: { id_programacao: id },
      select: { id_programacao: true }
    });

    if (!atividade) {
      return res.status(404).json({ error: 'Atividade não encontrada na programação.' });
    }

    await prisma.programacao.delete({ where: { id_programacao: id } });

    return res.json({ message: 'Atividade removida da programação com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover atividade da programação:', error);
    return res.status(500).json({ error: 'Erro ao remover a atividade.' });
  }
};
