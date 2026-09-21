const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');
const { gerarOuRetomarCobranca } = require('../services/cobrancaService');

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
      id_geektopia: true,
      geektopia: { select: { id_geektopia: true, nome_edicao: true, status_evento: true } }
    }
  },
  equipe: { select: { id_equipe: true, nome_equipe: true, integrantes: true, link_portfolio_grupo: true } },
  // Situação da taxa: a inscrição só está confirmada quando aprovada E (sem taxa OU pedido pago).
  pedido: { select: { id_pedido: true, status_pedido: true } }
};

// Regras de tamanho de equipe por modalidade (integrantes ALÉM do líder).
const INTEGRANTES = { Dupla: { min: 1, max: 1 }, Grupo: { min: 2, max: 9 } };

// Valida os dados de equipe enviados junto com a inscrição.
// Corpo: { nome_equipe, link_portfolio_grupo?, integrantes: "Nome 1\nNome 2" ou ["Nome 1", ...] }
function validarEquipeNova(equipe, modalidade) {
  if (!equipe || typeof equipe !== 'object') {
    return { erro: `A modalidade ${modalidade} exige os dados da equipe.` };
  }

  const nome = lerTexto(equipe.nome_equipe, 100);
  if (!nome) return { erro: 'Informe o nome da equipe (até 100 caracteres).' };

  const lista = (Array.isArray(equipe.integrantes) ? equipe.integrantes : String(equipe.integrantes || '').split('\n'))
    .map((n) => String(n).trim().replace(/\s+/g, ' '))
    .filter(Boolean);

  const regra = INTEGRANTES[modalidade];
  if (lista.length < regra.min || lista.length > regra.max) {
    return {
      erro: modalidade === 'Dupla'
        ? 'Uma dupla tem 2 pessoas: informe o nome do seu parceiro(a).'
        : `Informe de ${regra.min} a ${regra.max} integrantes além de você.`
    };
  }
  if (lista.some((n) => n.length < 3 || n.length > 100)) {
    return { erro: 'Cada integrante deve ter entre 3 e 100 caracteres.' };
  }

  let link = null;
  if (equipe.link_portfolio_grupo) {
    link = lerTexto(equipe.link_portfolio_grupo, 2000);
    if (!link || !/^https?:\/\//i.test(link)) return { erro: 'O link do portfólio da equipe deve começar com http:// ou https://.' };
  }

  return { valor: { nome_equipe: nome, integrantes: lista.join('\n'), link_portfolio_grupo: link } };
}

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

    // Solo não tem equipe. Dupla e Grupo criam a equipe junto com a inscrição
    // (o líder é quem se inscreve); usar uma equipe já existente continua possível.
    let equipeExistente = { valor: null };
    let equipeNova = null;

    if (competicao.modalidade === 'Solo') {
      if (req.body.equipe || (req.body.id_equipe !== undefined && req.body.id_equipe !== null)) {
        return res.status(400).json({ error: 'Competição na modalidade Solo não aceita equipe.' });
      }
    } else if (competicao.modalidade === 'Dupla' || competicao.modalidade === 'Grupo') {
      if (req.body.id_equipe !== undefined && req.body.id_equipe !== null) {
        equipeExistente = await conferirEquipe(req.body, idCompeticao);
        if (equipeExistente.erro) return res.status(400).json({ error: equipeExistente.erro });
      } else {
        const r = validarEquipeNova(req.body.equipe, competicao.modalidade);
        if (r.erro) return res.status(400).json({ error: r.erro, campo: 'equipe' });
        equipeNova = r.valor;
      }
    } else {
      equipeExistente = await conferirEquipe(req.body, idCompeticao);
      if (equipeExistente.erro) return res.status(400).json({ error: equipeExistente.erro });
    }

    const { erro, dados } = validarLinks(req.body);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    // Toda inscrição começa EM ANÁLISE: a organização avalia o material primeiro.
    // A taxa (se houver) é cobrada DEPOIS da aprovação, como na solicitação de
    // espaço e como no protótipo ("pagamento liberado" só após aprovar).
    const taxa = paraNumero(competicao.valor_taxa_inscricao) || 0;

    const nova = await prisma.$transaction(async (tx) => {
      let idEquipe = equipeExistente.valor;
      if (equipeNova) {
        const criada = await tx.equipe_Competicao.create({
          data: { ...equipeNova, id_competicao: idCompeticao, id_lider: req.userId }
        });
        idEquipe = criada.id_equipe;
      }

      return tx.inscricao_Competicao.create({
        data: {
          ...dados,
          id_competicao: idCompeticao,
          id_usuario: req.userId,
          id_equipe: idEquipe,
          status_inscricao: 'EmAnalise'
        },
        include: INCLUIR
      });
    });

    return res.status(201).json({
      message: taxa > 0
        ? `Inscrição enviada! A organização vai analisar o seu material. Se for aprovada, você paga a taxa de R$ ${taxa.toFixed(2)} para confirmar a vaga.`
        : 'Inscrição enviada! A organização vai analisar o seu material e você acompanha o resultado por aqui.',
      inscricao: montarResposta(nova)
    });  } catch (error) {
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
      select: { id_usuario: true, status_inscricao: true, id_pedido: true, id_equipe: true }
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

    await prisma.$transaction(async (tx) => {
      await tx.inscricao_Competicao.delete({ where: { id_inscricao: id } });
      // Equipe criada junto com a inscrição não deve ficar órfã.
      if (inscricao.id_equipe) {
        const restantes = await tx.inscricao_Competicao.count({ where: { id_equipe: inscricao.id_equipe } });
        if (restantes === 0) await tx.equipe_Competicao.delete({ where: { id_equipe: inscricao.id_equipe } });
      }
    });

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

    if (req.query.id_geektopia !== undefined) {
      const idGeektopia = lerId(req.query.id_geektopia);
      if (!idGeektopia) {
        return res.status(400).json({ error: 'O filtro "id_geektopia" é inválido.' });
      }
      filtro.competicao = { id_geektopia: idGeektopia };
    }

    const inscricoes = await prisma.inscricao_Competicao.findMany({
      where: filtro,
      include: {
        ...INCLUIR,
        competidor: {
          select: {
            nickname_competidor: true,
            modalidade_principal: true,
            url_portfolio: true,
            link_redes_sociais: true,
            participante: {
              select: { usuario: { select: { nome_completo: true, email: true, telefone: true, perfil: { select: { avatar_url: true } } } } }
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
      select: { id_inscricao: true, id_pedido: true }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Inscrição não encontrada.' });
    }

    // Só há motivo a registrar numa decisão; reprovar sem explicar deixa a pessoa no escuro.
    const observacao = req.body.observacao_admin === undefined ? undefined : lerTexto(req.body.observacao_admin, 1000);
    if (req.body.observacao_admin !== undefined && observacao === null && String(req.body.observacao_admin).trim() !== '') {
      return res.status(400).json({ error: 'A observação deve ter até 1000 caracteres.' });
    }
    if (status_inscricao === 'Reprovado' && !observacao) {
      return res.status(400).json({ error: 'Explique o motivo da reprovação para o competidor.', campo: 'observacao_admin' });
    }
    if (status_inscricao === 'Reprovado' && existe.id_pedido) {
      return res.status(409).json({ error: 'Esta inscrição já tem pedido de pagamento e não pode ser reprovada.' });
    }

    const atualizada = await prisma.inscricao_Competicao.update({
      where: { id_inscricao: id },
      data: { status_inscricao, ...(observacao !== undefined && { observacao_admin: observacao || null }) },
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

// POST /api/inscricoes/:id/pagamento - o competidor paga a taxa DEPOIS da aprovação
// Retomável: se já existe cobrança pendente, devolve o mesmo link.
exports.gerarPagamento = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador da inscrição é inválido.' });

    const insc = await prisma.inscricao_Competicao.findUnique({
      where: { id_inscricao: id },
      include: { competicao: { select: { nome_competicao: true, valor_taxa_inscricao: true } } }
    });

    if (!insc || insc.id_usuario !== req.userId) {
      return res.status(404).json({ error: 'Inscrição não encontrada.' });
    }
    if (insc.status_inscricao !== 'Aprovado') {
      return res.status(409).json({ error: 'A taxa só pode ser paga depois que a organização aprovar a inscrição.' });
    }

    const valor = paraNumero(insc.competicao.valor_taxa_inscricao) || 0;
    if (valor <= 0) return res.status(409).json({ error: 'Esta competição não tem taxa de inscrição.' });

    const pedidoAtual = insc.id_pedido
      ? await prisma.pedido.findUnique({ where: { id_pedido: insc.id_pedido }, select: { id_pedido: true, status_pedido: true } })
      : null;

    const r = await gerarOuRetomarCobranca({
      idUsuario: req.userId,
      valor,
      titulo: `Inscrição — ${insc.competicao.nome_competicao}`,
      pedidoAtual,
      vincular: (tx, idPedido) => tx.inscricao_Competicao.updateMany({
        where: { id_inscricao: id, id_pedido: null },
        data: { id_pedido: idPedido }
      })
    });

    if (r.erro) return res.status(r.status || 500).json({ error: r.erro, id_pedido: r.id_pedido });

    return res.status(201).json({
      message: r.retomado ? 'Pagamento retomado.' : 'Cobrança gerada com sucesso!',
      id_pedido: r.id_pedido,
      init_point: r.init_point
    });
  } catch (error) {
    console.error('Erro ao gerar pagamento da inscrição:', error);
    return res.status(500).json({ error: 'Erro ao gerar o pagamento da inscrição.' });
  }
};
