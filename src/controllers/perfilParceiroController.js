const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');
const { urlDoUpload, apagarArquivoLocal, descartarUpload } = require('../utils/arquivos');

// Perfis de parceiro do evento. O cadastro (authController) cria só o
// Usuario; é aqui que o usuário logado assume um papel a mais:
//
//   Expositor  -> pode solicitar espaço (Solicitacao_Espaco)
//   Competidor -> pode se inscrever em competições (Inscricao_Competicao)
//
// Sem estes endpoints, as tabelas Expositor e Competidor só podiam ser
// preenchidas direto no banco, e o módulo de parceiros ficava inalcançável
// pela API.
//
// Regra de segurança que vale para todo o arquivo: o id do usuário vem
// SEMPRE de req.userId (preenchido pelo authMiddleware a partir do token).
// Aceitar um id_usuario do corpo deixaria qualquer pessoa criar perfil em
// nome de outra.

// Valores aceitos pelo enum StatusAprovacaoEnum do schema.prisma.
const STATUS_VALIDOS = ['EmAnalise', 'Aprovado', 'Reprovado'];

// Dados básicos do usuário trazidos junto nas listagens administrativas.
const RESUMO_USUARIO = {
  select: { id_usuario: true, nome_completo: true, email: true, telefone: true, cidade: true }
};

// ==========================================================================
// MEU PERFIL
// ==========================================================================

// GET /api/parceiros/meu-perfil - quais papéis o usuário logado já tem
// O front usa isto para saber o que mostrar: "virar expositor", "solicitar
// espaço", "inscrever-se", etc.
exports.meuPerfil = async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id_usuario: req.userId },
      select: {
        id_usuario: true,
        nome_completo: true,
        email: true,
        participante: true,
        expositor: true,
        administrador: { select: { nivel_permissao: true, status_conta: true } },
        organizadorExterno: true
      }
    });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    // Competidor fica pendurado em Participante, não direto em Usuario.
    const competidor = usuario.participante
      ? await prisma.competidor.findUnique({ where: { id_usuario: req.userId } })
      : null;

    return res.json({
      id_usuario: usuario.id_usuario,
      nome_completo: usuario.nome_completo,
      email: usuario.email,
      papeis: {
        administrador: usuario.administrador,
        participante: usuario.participante,
        competidor,
        expositor: usuario.expositor,
        organizador_externo: usuario.organizadorExterno
      }
    });
  } catch (error) {
    console.error('Erro ao buscar perfil de parceiro:', error);
    return res.status(500).json({ error: 'Erro ao buscar o seu perfil.' });
  }
};

// ==========================================================================
// EXPOSITOR
// ==========================================================================

// Valida os campos do expositor. Só devolve o que veio no corpo.
function validarExpositor(corpo, ehCriacao) {
  const dados = {};

  // O schema permite nulo, mas expositor sem nome de loja não tem como ser
  // apresentado à diretoria. Exigimos no cadastro.
  if (ehCriacao || corpo.nome_loja_projeto !== undefined) {
    const nome = lerTexto(corpo.nome_loja_projeto, 100);
    if (!nome) {
      return { erro: 'O campo "nome_loja_projeto" é obrigatório e deve ter até 100 caracteres.' };
    }
    dados.nome_loja_projeto = nome;
  }

  if (corpo.tipo_expositor !== undefined) {
    dados.tipo_expositor = corpo.tipo_expositor === null ? null : lerTexto(corpo.tipo_expositor, 50);
    if (corpo.tipo_expositor !== null && dados.tipo_expositor === null) {
      return { erro: 'O campo "tipo_expositor" deve ter até 50 caracteres.' };
    }
  }

  if (corpo.url_portfolio !== undefined) {
    dados.url_portfolio = corpo.url_portfolio === null ? null : lerTexto(corpo.url_portfolio, 2000);
  }

  return { dados };
}

// POST /api/parceiros/expositor - o usuário logado vira expositor
// Corpo: { nome_loja_projeto, tipo_expositor?, url_portfolio? }
exports.criarExpositor = async (req, res) => {
  try {
    const existe = await prisma.expositor.findUnique({
      where: { id_usuario: req.userId },
      select: { status_aprovacao: true }
    });

    if (existe) {
      return res.status(409).json({
        error: `Você já possui um perfil de expositor (status: ${existe.status_aprovacao}).`
      });
    }

    const { erro, dados } = validarExpositor(req.body, true);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    // status_aprovacao nasce 'EmAnalise' pelo default do schema: a diretoria
    // avalia antes de o expositor aparecer como confirmado.
    const novo = await prisma.expositor.create({
      data: { ...dados, id_usuario: req.userId }
    });

    return res.status(201).json({
      message: 'Perfil de expositor criado! Agora você já pode solicitar um espaço.',
      expositor: novo
    });
  } catch (error) {
    console.error('Erro ao criar perfil de expositor:', error);
    return res.status(500).json({ error: 'Erro ao criar o perfil de expositor.' });
  }
};

// PUT /api/parceiros/expositor - atualiza o próprio perfil de expositor
// O status_aprovacao NÃO pode ser alterado por aqui: só a diretoria muda.
exports.atualizarExpositor = async (req, res) => {
  try {
    if (req.body.status_aprovacao !== undefined) {
      return res.status(400).json({
        error: 'O status de aprovação é definido pela diretoria e não pode ser alterado pelo expositor.'
      });
    }

    const { erro, dados } = validarExpositor(req.body, false);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const existe = await prisma.expositor.findUnique({
      where: { id_usuario: req.userId },
      select: { id_usuario: true }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Você ainda não possui perfil de expositor.' });
    }

    const atualizado = await prisma.expositor.update({
      where: { id_usuario: req.userId },
      data: dados
    });

    return res.json({ message: 'Perfil de expositor atualizado!', expositor: atualizado });
  } catch (error) {
    console.error('Erro ao atualizar perfil de expositor:', error);
    return res.status(500).json({ error: 'Erro ao atualizar o perfil de expositor.' });
  }
};

// GET /api/parceiros/admin/expositores - fila de análise da diretoria
// Aceita ?status=EmAnalise como filtro.
// Atende o caso de uso "w) Gerenciar Expositores" do PDF.
exports.listarExpositores = async (req, res) => {
  try {
    const filtro = {};

    if (req.query.status !== undefined) {
      if (!STATUS_VALIDOS.includes(req.query.status)) {
        return res.status(400).json({
          error: `O filtro "status" deve ser um destes: ${STATUS_VALIDOS.join(', ')}.`
        });
      }
      filtro.status_aprovacao = req.query.status;
    }

    const expositores = await prisma.expositor.findMany({
      where: filtro,
      include: {
        usuario: RESUMO_USUARIO,
        _count: { select: { solicitacoes: true } }
      },
      // Em análise primeiro: é a fila de trabalho da diretoria.
      orderBy: [{ status_aprovacao: 'asc' }, { id_usuario: 'desc' }]
    });

    return res.json(
      expositores.map(({ _count, ...e }) => ({ ...e, qtd_solicitacoes: _count.solicitacoes }))
    );
  } catch (error) {
    console.error('Erro ao listar expositores:', error);
    return res.status(500).json({ error: 'Erro ao listar os expositores.' });
  }
};

// PATCH /api/parceiros/admin/expositores/:id/status - a diretoria aprova ou reprova
// O :id é o id_usuario, que é a chave primária de Expositor.
exports.alterarStatusExpositor = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do expositor é inválido.' });
    }

    const { status_aprovacao } = req.body;

    if (!STATUS_VALIDOS.includes(status_aprovacao)) {
      return res.status(400).json({
        error: `O campo "status_aprovacao" deve ser um destes: ${STATUS_VALIDOS.join(', ')}.`
      });
    }

    const existe = await prisma.expositor.findUnique({
      where: { id_usuario: id },
      select: { id_usuario: true }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Expositor não encontrado.' });
    }

    const atualizado = await prisma.expositor.update({
      where: { id_usuario: id },
      data: { status_aprovacao },
      include: { usuario: RESUMO_USUARIO }
    });

    return res.json({
      message: `Expositor marcado como "${status_aprovacao}".`,
      expositor: atualizado
    });
  } catch (error) {
    console.error('Erro ao alterar status do expositor:', error);
    return res.status(500).json({ error: 'Erro ao alterar o status do expositor.' });
  }
};

// ==========================================================================
// COMPETIDOR
// ==========================================================================

// Valida os campos do competidor. Só devolve o que veio no corpo.
function validarCompetidor(corpo, ehCriacao) {
  const dados = {};

  // Nickname é como o competidor aparece nas chaves e no placar.
  if (ehCriacao || corpo.nickname_competidor !== undefined) {
    const nick = lerTexto(corpo.nickname_competidor, 30);
    if (!nick) {
      return { erro: 'O campo "nickname_competidor" é obrigatório e deve ter até 30 caracteres.' };
    }
    dados.nickname_competidor = nick;
  }

  const opcionais = [
    ['pronomes', 20],
    ['modalidade_principal', 50],
    ['url_portfolio', 2000],
    ['link_redes_sociais', 2000],
    ['url_autorizacao_menor', 2000]
  ];

  for (const [campo, limite] of opcionais) {
    if (corpo[campo] === undefined) continue;
    if (corpo[campo] === null) {
      dados[campo] = null;
      continue;
    }
    const valor = lerTexto(corpo[campo], limite);
    if (valor === null) {
      return { erro: `O campo "${campo}" deve ter até ${limite} caracteres.` };
    }
    dados[campo] = valor;
  }

  return { dados };
}

// POST /api/parceiros/competidor - o usuário logado vira competidor
// Corpo: { nickname_competidor, pronomes?, modalidade_principal?,
//          url_portfolio?, link_redes_sociais?, url_autorizacao_menor? }
//
// Competidor depende de Participante (Competidor.id_usuario -> Participante).
// Se o usuário ainda não é participante, criamos os dois na mesma transação:
// ou tudo entra, ou nada entra.
exports.criarCompetidor = async (req, res) => {
  try {
    const existe = await prisma.competidor.findUnique({
      where: { id_usuario: req.userId },
      select: { id_usuario: true }
    });

    if (existe) {
      return res.status(409).json({ error: 'Você já possui um perfil de competidor.' });
    }

    const { erro, dados } = validarCompetidor(req.body, true);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    const novo = await prisma.$transaction(async (tx) => {
      await tx.participante.upsert({
        where: { id_usuario: req.userId },
        create: { id_usuario: req.userId },
        update: {}
      });

      return tx.competidor.create({
        data: { ...dados, id_usuario: req.userId }
      });
    });

    return res.status(201).json({
      message: 'Perfil de competidor criado! Agora você pode se inscrever nas competições.',
      competidor: novo
    });
  } catch (error) {
    console.error('Erro ao criar perfil de competidor:', error);
    return res.status(500).json({ error: 'Erro ao criar o perfil de competidor.' });
  }
};

// PUT /api/parceiros/competidor - atualiza o próprio perfil de competidor
exports.atualizarCompetidor = async (req, res) => {
  try {
    const { erro, dados } = validarCompetidor(req.body, false);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const existe = await prisma.competidor.findUnique({
      where: { id_usuario: req.userId },
      select: { id_usuario: true }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Você ainda não possui perfil de competidor.' });
    }

    const atualizado = await prisma.competidor.update({
      where: { id_usuario: req.userId },
      data: dados
    });

    return res.json({ message: 'Perfil de competidor atualizado!', competidor: atualizado });
  } catch (error) {
    console.error('Erro ao atualizar perfil de competidor:', error);
    return res.status(500).json({ error: 'Erro ao atualizar o perfil de competidor.' });
  }
};

// GET /api/parceiros/admin/competidores - lista para a diretoria
// Atende o caso de uso "x) Gerenciar Competidores" do PDF.
exports.listarCompetidores = async (req, res) => {
  try {
    const competidores = await prisma.competidor.findMany({
      include: {
        participante: {
          select: {
            status_verificacao: true,
            autorizado_por_responsavel: true,
            usuario: RESUMO_USUARIO
          }
        },
        _count: { select: { inscricoes: true, equipesLideradas: true } }
      },
      orderBy: { id_usuario: 'desc' }
    });

    return res.json(
      competidores.map(({ _count, participante, ...c }) => ({
        ...c,
        usuario: participante.usuario,
        status_verificacao: participante.status_verificacao,
        autorizado_por_responsavel: participante.autorizado_por_responsavel,
        qtd_inscricoes: _count.inscricoes,
        qtd_equipes_lideradas: _count.equipesLideradas
      }))
    );
  } catch (error) {
    console.error('Erro ao listar competidores:', error);
    return res.status(500).json({ error: 'Erro ao listar os competidores.' });
  }
};

// PATCH /api/parceiros/expositor/logo (multipart: logo)
// Logo do próprio expositor, exibida no carrossel de expositores confirmados.
// Substitui a anterior; o dono vem do token, nunca do corpo.
exports.uploadLogoExpositor = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie a imagem no campo "logo".' });
    }

    const atual = await prisma.expositor.findUnique({
      where: { id_usuario: req.userId },
      select: { url_logo: true }
    });

    if (!atual) {
      descartarUpload(req);
      return res.status(404).json({ error: 'Você ainda não possui perfil de expositor.' });
    }

    const expositor = await prisma.expositor.update({
      where: { id_usuario: req.userId },
      data: { url_logo: urlDoUpload(req, 'logos', req.file) }
    });

    apagarArquivoLocal(atual.url_logo);

    return res.json({ message: 'Logo atualizada com sucesso!', url_logo: expositor.url_logo });
  } catch (error) {
    descartarUpload(req);
    console.error('Erro ao enviar logo do expositor:', error);
    return res.status(500).json({ error: 'Erro ao enviar a logo.' });
  }
};
