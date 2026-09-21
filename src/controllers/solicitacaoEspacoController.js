const prisma = require('../config/prisma');
const { notificar, notificarAdmins } = require('../services/notificacoes');
const { lerId, lerTexto } = require('../utils/validadores');
const { gerarOuRetomarCobranca } = require('../services/cobrancaService');

// Valores aceitos pelo enum StatusAprovacaoEnum do schema.prisma.
const STATUS_VALIDOS = ['EmAnalise', 'Aprovado', 'Reprovado'];

// Enquanto está em análise o expositor ainda pode mexer. Depois de decidido,
// alterar mudaria o que a diretoria já avaliou.
const STATUS_EDITAVEL = 'EmAnalise';

// Colunas DECIMAL desta tabela, que o Prisma devolve como objeto Decimal.
const CAMPOS_DECIMAIS = [
  'valor_taxa_ajudante_momento',
  'valor_taxa_mesa_extra_momento',
  'valor_taxa_cadeira_extra_momento',
  'valor_total_final'
];

const paraNumero = (v) => (v === null || v === undefined ? null : Number(v));

// Monta a resposta de uma solicitação.
function montarResposta(s) {
  const resposta = { ...s };
  for (const campo of CAMPOS_DECIMAIS) {
    resposta[campo] = paraNumero(s[campo]);
  }
  if (s.espaco) {
    resposta.espaco = { ...s.espaco, valor_base: paraNumero(s.espaco.valor_base) };
  }
  return resposta;
}

// Lê uma quantidade de extras. Ausente vira 0, que é o default do schema.
function lerQuantidade(valor, campo) {
  if (valor === undefined || valor === null) return { valor: 0 };
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) {
    return { erro: `O campo "${campo}" deve ser um número inteiro maior ou igual a zero.` };
  }
  if (n > 999) {
    return { erro: `O campo "${campo}" excede o limite razoável de 999.` };
  }
  return { valor: n };
}

// Calcula o total e devolve as taxas congeladas.
//
// Este é o coração do controller. As colunas terminadas em "_momento" guardam
// uma CÓPIA das taxas do catálogo no instante da candidatura. Se o CCPOP subir
// o preço da cadeira extra amanhã, quem já pediu continua pagando o combinado.
// É o mesmo princípio da diária de hotel travada na reserva.
function calcularTotal(espaco, extras) {
  const base = Number(espaco.valor_base || 0);
  const taxaAjudante = Number(espaco.valor_taxa_ajudante || 0);
  const taxaMesa = Number(espaco.valor_taxa_mesa_extra || 0);
  const taxaCadeira = Number(espaco.valor_taxa_cadeira_extra || 0);

  const total =
    base +
    extras.ajudantes * taxaAjudante +
    extras.mesas * taxaMesa +
    extras.cadeiras * taxaCadeira;

  return {
    valor_taxa_ajudante_momento: taxaAjudante,
    valor_taxa_mesa_extra_momento: taxaMesa,
    valor_taxa_cadeira_extra_momento: taxaCadeira,
    // Arredonda para as 2 casas que a coluna DECIMAL(10,2) guarda.
    valor_total_final: Math.round(total * 100) / 100
  };
}

// Dados trazidos junto em toda consulta, para o front não precisar de N chamadas.
const INCLUIR = {
  espaco: {
    select: {
      id_espaco: true,
      tipo_espaco: true,
      valor_base: true,
      qtd_credenciais_inclusas: true
    }
  },
  geektopia: { select: { id_geektopia: true, nome_edicao: true, status_evento: true } },
  // Situação da taxa: só vira "confirmado" no site quando o pedido está Pago.
  pedido: { select: { id_pedido: true, status_pedido: true } },
  _count: { select: { ajudantes: true } }
};

// POST /api/solicitacoes-espaco - o expositor se candidata a um espaço
// Corpo: { id_geektopia, id_espaco, qtd_ajudantes_extras?, qtd_mesas_extras?,
//          qtd_cadeiras_extras?, url_contrato_assinado? }
exports.criar = async (req, res) => {
  try {
    // O dono da solicitação vem SEMPRE do token, nunca do corpo da requisição.
    // Aceitar um id_usuario enviado pelo cliente deixaria qualquer pessoa
    // cadastrar candidatura no nome de outra.
    const idUsuario = req.userId;

    const expositor = await prisma.expositor.findUnique({
      where: { id_usuario: idUsuario },
      select: { id_usuario: true, status_aprovacao: true, nome_loja_projeto: true }
    });

    if (!expositor) {
      return res.status(403).json({
        error: 'Apenas usuários com perfil de expositor podem solicitar espaço.'
      });
    }

    if (expositor.status_aprovacao === 'Reprovado') {
      return res.status(403).json({
        error: 'O seu perfil de expositor não foi aprovado pela diretoria. Entre em contato com a organização.'
      });
    }

    const idGeektopia = lerId(req.body.id_geektopia);
    const idEspaco = lerId(req.body.id_espaco);

    if (!idGeektopia || !idEspaco) {
      return res.status(400).json({
        error: 'Os campos "id_geektopia" e "id_espaco" são obrigatórios e devem ser identificadores válidos.'
      });
    }

    const [edicao, espaco] = await Promise.all([
      prisma.geektopia.findUnique({
        where: { id_geektopia: idGeektopia },
        select: { status_evento: true }
      }),
      prisma.espaco.findUnique({ where: { id_espaco: idEspaco } })
    ]);

    if (!edicao) {
      return res.status(404).json({ error: 'A edição da Geektopia informada não existe.' });
    }

    if (!espaco) {
      return res.status(404).json({ error: 'O tipo de espaço informado não existe.' });
    }

    // O espaço precisa ser da edição escolhida (não são os mesmos espaços em
    // toda Geektopia: muda o local, o layout e o preço).
    if (espaco.id_geektopia !== idGeektopia) {
      return res.status(400).json({ error: 'Este espaço não pertence à edição escolhida. Escolha um espaço da lista desta edição.' });
    }

    // Edição encerrada ou ainda em rascunho não recebe candidatura.
    if (edicao.status_evento === 'Encerrado') {
      return res.status(409).json({
        error: 'Não é possível se candidatar: esta edição já foi encerrada.'
      });
    }

    if (edicao.status_evento === 'Bloqueado') {
      return res.status(404).json({ error: 'A edição da Geektopia informada não existe.' });
    }

    const extras = {};
    for (const [chave, campo] of [
      ['ajudantes', 'qtd_ajudantes_extras'],
      ['mesas', 'qtd_mesas_extras'],
      ['cadeiras', 'qtd_cadeiras_extras']
    ]) {
      const r = lerQuantidade(req.body[campo], campo);
      if (r.erro) return res.status(400).json({ error: r.erro });
      extras[chave] = r.valor;
    }

    // Um expositor não pode ter duas candidaturas abertas na mesma edição.
    const jaExiste = await prisma.solicitacao_Espaco.findFirst({
      where: {
        id_usuario: idUsuario,
        id_geektopia: idGeektopia,
        status_solicitacao: { in: ['EmAnalise', 'Aprovado'] }
      },
      select: { id_solicitacao: true, status_solicitacao: true }
    });

    if (jaExiste) {
      return res.status(409).json({
        error: `Você já possui uma solicitação ${jaExiste.status_solicitacao === 'Aprovado' ? 'aprovada' : 'em análise'} para esta edição.`,
        id_solicitacao: jaExiste.id_solicitacao
      });
    }

    const congelado = calcularTotal(espaco, extras);

    const nova = await prisma.solicitacao_Espaco.create({
      data: {
        id_usuario: idUsuario,
        id_geektopia: idGeektopia,
        id_espaco: idEspaco,
        qtd_ajudantes_extras: extras.ajudantes,
        qtd_mesas_extras: extras.mesas,
        qtd_cadeiras_extras: extras.cadeiras,
        url_contrato_assinado: lerTexto(req.body.url_contrato_assinado, 2000),
        ...congelado
      },
      include: INCLUIR
    });

    notificarAdmins({
      tipo: 'solicitacao_nova', titulo: 'Novo pedido de espaço para analisar',
      texto: `${expositor.nome_loja_projeto || 'Um expositor'} pediu espaço em ${nova.geektopia?.nome_edicao || 'uma edição'}.`,
      link: '/admin/solicitacoes?tipo=expositores'
    });

    return res.status(201).json({
      message: 'Solicitação de espaço enviada! Aguarde a análise da diretoria.',
      solicitacao: montarResposta(nova)
    });
  } catch (error) {
    console.error('Erro ao criar solicitação de espaço:', error);
    return res.status(500).json({ error: 'Erro ao enviar a solicitação de espaço.' });
  }
};

// GET /api/solicitacoes-espaco/minhas - as candidaturas de quem está logado
exports.listarMinhas = async (req, res) => {
  try {
    const solicitacoes = await prisma.solicitacao_Espaco.findMany({
      where: { id_usuario: req.userId },
      include: INCLUIR,
      orderBy: { id_solicitacao: 'desc' }
    });

    return res.json(solicitacoes.map(montarResposta));
  } catch (error) {
    console.error('Erro ao listar solicitações do expositor:', error);
    return res.status(500).json({ error: 'Erro ao listar suas solicitações.' });
  }
};

// GET /api/solicitacoes-espaco/:id - uma candidatura
//
// Só o próprio expositor ou um administrador enxergam. Sem essa checagem
// qualquer pessoa logada trocaria o número na URL e leria a candidatura
// alheia, com valores e dados de contato.
exports.buscarPorId = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da solicitação é inválido.' });
    }

    const solicitacao = await prisma.solicitacao_Espaco.findUnique({
      where: { id_solicitacao: id },
      include: INCLUIR
    });

    if (!solicitacao) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }

    const ehDono = solicitacao.id_usuario === req.userId;

    if (!ehDono && req.userIsAdmin !== true) {
      // 404 e não 403: não confirmamos que a solicitação existe para quem
      // não tem nada a ver com ela.
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }

    return res.json(montarResposta(solicitacao));
  } catch (error) {
    console.error('Erro ao buscar solicitação de espaço:', error);
    return res.status(500).json({ error: 'Erro ao buscar a solicitação.' });
  }
};

// GET /api/solicitacoes-espaco/admin/todas - fila de análise da diretoria
// Aceita ?status=EmAnalise e ?id_geektopia=7 como filtros.
exports.listarTodas = async (req, res) => {
  try {
    const filtro = {};

    if (req.query.status !== undefined) {
      if (!STATUS_VALIDOS.includes(req.query.status)) {
        return res.status(400).json({
          error: `O filtro "status" deve ser um destes: ${STATUS_VALIDOS.join(', ')}.`
        });
      }
      filtro.status_solicitacao = req.query.status;
    }

    if (req.query.id_geektopia !== undefined) {
      const idGeektopia = lerId(req.query.id_geektopia);
      if (!idGeektopia) {
        return res.status(400).json({ error: 'O filtro "id_geektopia" é inválido.' });
      }
      filtro.id_geektopia = idGeektopia;
    }

    const solicitacoes = await prisma.solicitacao_Espaco.findMany({
      where: filtro,
      include: {
        ...INCLUIR,
        expositor: {
          select: {
            nome_loja_projeto: true,
            tipo_expositor: true,
            url_logo: true,
            url_portfolio: true,
            usuario: { select: { nome_completo: true, email: true, telefone: true } }
          }
        }
      },
      // Em análise primeiro: é a fila de trabalho da diretoria.
      orderBy: [{ status_solicitacao: 'asc' }, { id_solicitacao: 'desc' }]
    });

    return res.json(solicitacoes.map(montarResposta));
  } catch (error) {
    console.error('Erro ao listar solicitações de espaço:', error);
    return res.status(500).json({ error: 'Erro ao listar as solicitações.' });
  }
};

// PUT /api/solicitacoes-espaco/:id - o expositor ajusta a própria candidatura
//
// Só enquanto estiver EmAnalise. Depois de decidida, mexer mudaria o que a
// diretoria já avaliou. Os totais são recalculados com as taxas do catálogo
// vigentes AGORA, porque na prática é uma nova proposta.
exports.atualizar = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da solicitação é inválido.' });
    }

    const atual = await prisma.solicitacao_Espaco.findUnique({
      where: { id_solicitacao: id },
      select: {
        id_usuario: true,
        id_espaco: true,
        status_solicitacao: true,
        qtd_ajudantes_extras: true,
        qtd_mesas_extras: true,
        qtd_cadeiras_extras: true
      }
    });

    if (!atual) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }

    if (atual.id_usuario !== req.userId) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }

    if (atual.status_solicitacao !== STATUS_EDITAVEL) {
      return res.status(409).json({
        error: `Esta solicitação já foi ${atual.status_solicitacao === 'Aprovado' ? 'aprovada' : 'reprovada'} e não pode mais ser alterada.`
      });
    }

    // Quantidades: mantém a atual quando o campo não vem no corpo.
    const extras = {};
    for (const [chave, campo] of [
      ['ajudantes', 'qtd_ajudantes_extras'],
      ['mesas', 'qtd_mesas_extras'],
      ['cadeiras', 'qtd_cadeiras_extras']
    ]) {
      if (req.body[campo] === undefined) {
        extras[chave] = atual[campo] || 0;
      } else {
        const r = lerQuantidade(req.body[campo], campo);
        if (r.erro) return res.status(400).json({ error: r.erro });
        extras[chave] = r.valor;
      }
    }

    const espaco = await prisma.espaco.findUnique({ where: { id_espaco: atual.id_espaco } });

    if (!espaco) {
      return res.status(409).json({
        error: 'O tipo de espaço desta solicitação não existe mais no catálogo.'
      });
    }

    const dados = {
      qtd_ajudantes_extras: extras.ajudantes,
      qtd_mesas_extras: extras.mesas,
      qtd_cadeiras_extras: extras.cadeiras,
      ...calcularTotal(espaco, extras)
    };

    if (req.body.url_contrato_assinado !== undefined) {
      dados.url_contrato_assinado =
        req.body.url_contrato_assinado === null
          ? null
          : lerTexto(req.body.url_contrato_assinado, 2000);
    }

    const atualizada = await prisma.solicitacao_Espaco.update({
      where: { id_solicitacao: id },
      data: dados,
      include: INCLUIR
    });

    return res.json({
      message: 'Solicitação atualizada com sucesso!',
      solicitacao: montarResposta(atualizada)
    });
  } catch (error) {
    console.error('Erro ao atualizar solicitação de espaço:', error);
    return res.status(500).json({ error: 'Erro ao atualizar a solicitação.' });
  }
};

// PATCH /api/solicitacoes-espaco/:id/status - a diretoria aprova ou reprova
// Atende o caso de uso "Gerenciar Expositores" do PDF.
exports.alterarStatus = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da solicitação é inválido.' });
    }

    const { status_solicitacao } = req.body;

    if (!STATUS_VALIDOS.includes(status_solicitacao)) {
      return res.status(400).json({
        error: `O campo "status_solicitacao" deve ser um destes: ${STATUS_VALIDOS.join(', ')}.`
      });
    }

    const existe = await prisma.solicitacao_Espaco.findUnique({
      where: { id_solicitacao: id },
      select: { id_solicitacao: true }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }

    const atualizada = await prisma.solicitacao_Espaco.update({
      where: { id_solicitacao: id },
      data: { status_solicitacao },
      include: INCLUIR
    });

    // O expositor é avisado da decisão (site e, se configurado, e-mail).
    const nomeEdicao = atualizada.geektopia?.nome_edicao || 'a edição';
    if (status_solicitacao === 'Aprovado') {
      notificar(atualizada.id_usuario, {
        tipo: 'solicitacao_aprovada', titulo: 'Seu pedido de espaço foi aprovado!',
        texto: `A diretoria aprovou o seu pedido de espaço em ${nomeEdicao}. Falta pagar a taxa para confirmar a sua presença.`,
        link: `/expositor/solicitacoes/${id}`
      });
    } else if (status_solicitacao === 'Reprovado') {
      notificar(atualizada.id_usuario, {
        tipo: 'solicitacao_reprovada', titulo: 'Seu pedido de espaço não foi aprovado',
        texto: `A diretoria não aprovou o seu pedido de espaço em ${nomeEdicao}. Você pode fazer uma nova solicitação.`,
        link: `/expositor/solicitacoes/${id}`
      });
    }

    return res.json({
      message: `Solicitação marcada como "${status_solicitacao}".`,
      solicitacao: montarResposta(atualizada)
    });
  } catch (error) {
    console.error('Erro ao alterar status da solicitação:', error);
    return res.status(500).json({ error: 'Erro ao alterar o status da solicitação.' });
  }
};

// DELETE /api/solicitacoes-espaco/:id - cancela a candidatura
//
// O expositor cancela a própria enquanto está em análise; o administrador
// pode remover qualquer uma.
exports.remover = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da solicitação é inválido.' });
    }

    const solicitacao = await prisma.solicitacao_Espaco.findUnique({
      where: { id_solicitacao: id },
      select: {
        id_usuario: true,
        status_solicitacao: true,
        id_pedido: true,
        _count: { select: { ajudantes: true } }
      }
    });

    if (!solicitacao) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }

    const ehDono = solicitacao.id_usuario === req.userId;
    const ehAdmin = req.userIsAdmin === true;

    if (!ehDono && !ehAdmin) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }

    // O expositor só cancela enquanto está em análise. O admin não tem essa trava.
    if (!ehAdmin && solicitacao.status_solicitacao !== STATUS_EDITAVEL) {
      return res.status(409).json({
        error: 'Esta solicitação já foi analisada. Entre em contato com a organização para cancelá-la.'
      });
    }

    // Ajudante_Expositor usa ON DELETE RESTRICT: o banco recusaria com erro genérico.
    if (solicitacao._count.ajudantes > 0) {
      return res.status(409).json({
        error:
          `Não é possível excluir: existem ${solicitacao._count.ajudantes} ajudante(s) ` +
          'cadastrado(s) nesta solicitação. Remova-os primeiro.',
        vinculos: { ajudantes: solicitacao._count.ajudantes }
      });
    }

    if (solicitacao.id_pedido !== null) {
      return res.status(409).json({
        error: 'Não é possível excluir: esta solicitação já gerou um pedido de pagamento.'
      });
    }

    await prisma.solicitacao_Espaco.delete({ where: { id_solicitacao: id } });

    return res.json({ message: 'Solicitação removida com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover solicitação de espaço:', error);
    return res.status(500).json({ error: 'Erro ao remover a solicitação.' });
  }
};

// ==========================================================================
// AJUDANTES DO EXPOSITOR
// ==========================================================================
//
// A quantidade paga fica em qtd_ajudantes_extras (definida na candidatura);
// aqui só cadastramos QUEM são essas pessoas (nome/CPF), até esse limite.

// Confere se a solicitação existe e pertence a quem está logado (ou é admin).
// Usada pelas 3 rotas de ajudante abaixo.
async function conferirDonoDaSolicitacao(id, req) {
  const solicitacao = await prisma.solicitacao_Espaco.findUnique({
    where: { id_solicitacao: id },
    select: { id_usuario: true, status_solicitacao: true, qtd_ajudantes_extras: true }
  });

  if (!solicitacao || (solicitacao.id_usuario !== req.userId && req.userIsAdmin !== true)) {
    return { erro: { status: 404, mensagem: 'Solicitação não encontrada.' } };
  }

  return { solicitacao };
}

// POST /api/solicitacoes-espaco/:id/ajudantes - cadastra um ajudante
// Corpo: { nome_completo?, cpf? }
exports.adicionarAjudante = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da solicitação é inválido.' });
    }

    const { erro, solicitacao } = await conferirDonoDaSolicitacao(id, req);

    if (erro) {
      return res.status(erro.status).json({ error: erro.mensagem });
    }

    if (solicitacao.status_solicitacao !== STATUS_EDITAVEL) {
      return res.status(409).json({
        error: 'Só é possível cadastrar ajudantes enquanto a solicitação está em análise.'
      });
    }

    const jaCadastrados = await prisma.ajudante_Expositor.count({ where: { id_solicitacao: id } });

    if (jaCadastrados >= solicitacao.qtd_ajudantes_extras) {
      return res.status(409).json({
        error:
          `Esta solicitação reservou ${solicitacao.qtd_ajudantes_extras} ajudante(s) extra(s) e já ` +
          `tem ${jaCadastrados} cadastrado(s). Para adicionar mais, aumente a quantidade na própria solicitação.`
      });
    }

    const nomeCompleto = req.body.nome_completo === undefined ? null : lerTexto(req.body.nome_completo, 150);
    const cpf = req.body.cpf === undefined ? null : lerTexto(req.body.cpf, 11);

    const novo = await prisma.ajudante_Expositor.create({
      data: { id_solicitacao: id, nome_completo: nomeCompleto, cpf }
    });

    return res.status(201).json({ message: 'Ajudante cadastrado com sucesso!', ajudante: novo });
  } catch (error) {
    console.error('Erro ao cadastrar ajudante:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar o ajudante.' });
  }
};

// GET /api/solicitacoes-espaco/:id/ajudantes - lista os ajudantes cadastrados
exports.listarAjudantes = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da solicitação é inválido.' });
    }

    const { erro } = await conferirDonoDaSolicitacao(id, req);

    if (erro) {
      return res.status(erro.status).json({ error: erro.mensagem });
    }

    const ajudantes = await prisma.ajudante_Expositor.findMany({
      where: { id_solicitacao: id },
      orderBy: { id_ajudante: 'asc' }
    });

    return res.json(ajudantes);
  } catch (error) {
    console.error('Erro ao listar ajudantes:', error);
    return res.status(500).json({ error: 'Erro ao listar os ajudantes.' });
  }
};

// DELETE /api/solicitacoes-espaco/:id/ajudantes/:idAjudante
exports.removerAjudante = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    const idAjudante = lerId(req.params.idAjudante);

    if (!id || !idAjudante) {
      return res.status(400).json({ error: 'Identificador inválido.' });
    }

    const { erro, solicitacao } = await conferirDonoDaSolicitacao(id, req);

    if (erro) {
      return res.status(erro.status).json({ error: erro.mensagem });
    }

    if (solicitacao.status_solicitacao !== STATUS_EDITAVEL) {
      return res.status(409).json({
        error: 'Só é possível remover ajudantes enquanto a solicitação está em análise.'
      });
    }

    const ajudante = await prisma.ajudante_Expositor.findUnique({ where: { id_ajudante: idAjudante } });

    if (!ajudante || ajudante.id_solicitacao !== id) {
      return res.status(404).json({ error: 'Ajudante não encontrado nesta solicitação.' });
    }

    await prisma.ajudante_Expositor.delete({ where: { id_ajudante: idAjudante } });

    return res.json({ message: 'Ajudante removido com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover ajudante:', error);
    return res.status(500).json({ error: 'Erro ao remover o ajudante.' });
  }
};

// POST /api/solicitacoes-espaco/:id/pagamento - gera a cobrança da taxa desta
// solicitação no Mercado Pago (Checkout Pro: aceita Pix, cartão e boleto sem
// configuração extra).
//
// Só depois de aprovada: a diretoria decide o valor final antes de cobrar
// (o "estudo" combinado com o cliente), e o valor já vem congelado em
// `valor_total_final` desde a candidatura, então uma mudança posterior no
// catálogo de Espaco não muda o que este expositor paga.
//
// O Pedido criado aqui não tem Item_Pedido (não é ingresso) — só é ligado à
// solicitação pelo campo id_pedido. O webhook/receberWebhook já lida bem com
// isso: ele só gera Ingresso para itens que têm id_lote, e um Pedido sem
// nenhum item simplesmente não gera nenhum. Nenhuma mudança foi necessária
// lá.
exports.gerarPagamento = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador da solicitação é inválido.' });
    }

    const solicitacao = await prisma.solicitacao_Espaco.findUnique({
      where: { id_solicitacao: id },
      include: { espaco: { select: { tipo_espaco: true } } }
    });

    if (!solicitacao || solicitacao.id_usuario !== req.userId) {
      return res.status(404).json({ error: 'Solicitação não encontrada.' });
    }

    if (solicitacao.status_solicitacao !== 'Aprovado') {
      return res.status(409).json({
        error: 'Só é possível gerar a cobrança depois que a diretoria aprovar a solicitação.'
      });
    }

    const valor = Number(solicitacao.valor_total_final);

    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(409).json({ error: 'Esta solicitação não tem um valor definido para cobrança.' });
    }

    const r = await gerarOuRetomarCobranca({
      idUsuario: req.userId,
      valor,
      titulo: `Taxa de espaço — ${solicitacao.espaco.tipo_espaco || 'Expositor'}`,
      pedidoAtual: solicitacao.id_pedido !== null
        ? await prisma.pedido.findUnique({ where: { id_pedido: solicitacao.id_pedido }, select: { id_pedido: true, status_pedido: true } })
        : null,
      vincular: (tx, idPedido) => tx.solicitacao_Espaco.updateMany({
        where: { id_solicitacao: id, id_pedido: null },
        data: { id_pedido: idPedido }
      })
    });

    if (r.erro) return res.status(r.status).json({ error: r.erro, id_pedido: r.id_pedido });

    return res.status(201).json({
      message: r.retomado ? 'Pagamento retomado.' : 'Cobrança gerada com sucesso!',
      id_pedido: r.id_pedido,
      init_point: r.init_point
    });
  } catch (error) {
    console.error('Erro ao gerar pagamento da solicitação de espaço:', error);
    return res.status(500).json({ error: 'Erro interno ao gerar o pagamento.' });
  }
};
