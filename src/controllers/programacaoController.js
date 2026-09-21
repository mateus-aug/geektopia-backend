const prisma = require('../config/prisma');
const { lerId, lerData, lerTexto } = require('../utils/validadores');

// Status de edição visíveis ao público.
const STATUS_PUBLICOS = ['VendasAbertas', 'VendasEncerradas', 'Encerrado'];

// Campos da competição devolvidos junto com a atividade.
const RESUMO_COMPETICAO = {
  select: { id_competicao: true, nome_competicao: true, modalidade: true }
};

// Valida os campos da atividade.
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
    // Só na criação: atividade passada continua editável.
    if (ehCriacao && inicio <= new Date()) {
      return { erro: 'A data e hora de início da atividade devem ser futuras.' };
    }
    dados.data_hora_inicio = inicio;
  }

  if (corpo.data_hora_fim !== undefined) {
    // null limpa o campo.
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

// Confere se a competição existe e pertence à mesma edição.
// valor: undefined = campo não enviado; null = desvincular.
async function conferirCompeticao(corpo, idGeektopia) {
  if (corpo.id_competicao === undefined) {
    return { valor: undefined };
  }

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

// GET /api/geektopia/:id/programacao
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

    const visivel = edicao && (STATUS_PUBLICOS.includes(edicao.status_evento) || req.userIsAdmin === true);

    if (!visivel) {
      return res.status(404).json({ error: 'Edição da Geektopia não encontrada.' });
    }

    const atividades = await prisma.programacao.findMany({
      where: { id_geektopia: idGeektopia },
      include: { competicao: RESUMO_COMPETICAO },
      orderBy: { data_hora_inicio: 'asc' }
    });

    return res.json(atividades);
  } catch (error) {
    console.error('Erro ao listar a programação da edição:', error);
    return res.status(500).json({ error: 'Erro ao listar a programação do evento.' });
  }
};

// GET /api/programacao/:id
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

// POST /api/programacao
exports.criar = async (req, res) => {
  try {
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

// PUT /api/programacao/:id
exports.atualizar = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da atividade é inválido.' });
    }

    // Não permite trocar de edição.
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

    // Horário que não veio no corpo é comparado com o do banco.
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

// DELETE /api/programacao/:id
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
