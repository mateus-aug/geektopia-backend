const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');

// Status de edição que o público pode enxergar. Se a edição está 'Bloqueado',
// os lotes dela também ficam invisíveis.
const STATUS_PUBLICOS = ['VendasAbertas', 'VendasEncerradas', 'Encerrado'];

// DECIMAL(10,2) comporta no máximo 8 dígitos antes da vírgula.
const VALOR_MAXIMO = 100000000;

// Monta a resposta de um lote.
//
// `valor_ingresso` é DECIMAL(10,2) e o Prisma o devolve como objeto Decimal,
// que não vira número comum no JSON. A conversão para Number é segura aqui:
// preços de ingresso ficam muito abaixo do limite de precisão do float.
//
// `quantidade_total` é a CAPACIDADE do lote e não diminui a cada venda (a
// trigger de baixa de estoque do Quadro 50 não existe). O que já foi vendido
// se conta pelos ingressos emitidos, do mesmo jeito que o pedidoController faz
// na hora de recusar uma compra acima do estoque. Quando a consulta traz o
// _count, `esgotado` e `restantes` seguem essa mesma conta; sem ele (criação e
// edição), só dá para saber se a capacidade é zero.
function montarResposta(lote) {
  const { _count, ...campos } = lote;

  const resposta = {
    ...campos,
    valor_ingresso: lote.valor_ingresso === null ? null : Number(lote.valor_ingresso),
    esgotado: lote.quantidade_total !== null && lote.quantidade_total <= 0
  };

  if (_count) {
    resposta.ingressos_emitidos = _count.ingressos;

    if (lote.quantidade_total !== null) {
      resposta.restantes = Math.max(lote.quantidade_total - _count.ingressos, 0);
      resposta.esgotado = resposta.restantes === 0;
    }
  }

  return resposta;
}

// Valores aceitos pelo enum CategoriaIngressoEnum do schema.prisma.
const CATEGORIAS = ['Inteira', 'Meia', 'MeetGreet', 'MeiaSolidaria', 'Outro'];

// Valida os campos enviados. Só devolve o que veio no corpo, para o PUT
// conseguir alterar um campo sem apagar os outros.
//
// `id_geektopia` NÃO é tratado aqui: confirmar que a edição existe exige
// consulta ao banco, e isso acontece dentro do método `criar`.
function validarDados(corpo, ehCriacao) {
  const dados = {};

  if (ehCriacao || corpo.nome_lote !== undefined) {
    const nome = lerTexto(corpo.nome_lote, 50);
    if (!nome) {
      return { erro: 'O campo "nome_lote" é obrigatório e deve ter até 50 caracteres.' };
    }
    dados.nome_lote = nome;
  }

  // Restrição do Quadro 12: valor maior que zero.
  if (ehCriacao || corpo.valor_ingresso !== undefined) {
    const valor = Number(corpo.valor_ingresso);

    if (!Number.isFinite(valor) || valor <= 0) {
      return { erro: 'O campo "valor_ingresso" é obrigatório e deve ser maior que zero.' };
    }

    // A coluna guarda 2 casas decimais e o PostgreSQL já arredonda sozinho na
    // gravação. Arredondamos aqui para que a checagem de valor máximo logo
    // abaixo enxergue exatamente o número que será gravado.
    const arredondado = Math.round(valor * 100) / 100;

    if (arredondado >= VALOR_MAXIMO) {
      return { erro: 'O campo "valor_ingresso" excede o valor máximo permitido.' };
    }

    dados.valor_ingresso = arredondado;
  }

  // Restrição do Quadro 12: quantidade maior que zero.
  if (ehCriacao || corpo.quantidade_total !== undefined) {
    const quantidade = Number(corpo.quantidade_total);

    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      return { erro: 'O campo "quantidade_total" é obrigatório e deve ser um inteiro maior que zero.' };
    }

    dados.quantidade_total = quantidade;
  }

  if (corpo.categoria !== undefined) {
    if (!CATEGORIAS.includes(corpo.categoria)) {
      return { erro: `O campo "categoria" deve ser um destes: ${CATEGORIAS.join(', ')}.` };
    }
    dados.categoria = corpo.categoria;
  }

  return { dados };
}

// GET /api/geektopia/:id/lotes - lotes de uma edição
// Rota aninhada: o visitante sempre vê os lotes no contexto do evento.
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

    const lotes = await prisma.lote.findMany({
      where: { id_geektopia: idGeektopia },
      include: { _count: { select: { ingressos: true } } },
      orderBy: { valor_ingresso: 'asc' }
    });

    return res.json(lotes.map(montarResposta));
  } catch (error) {
    console.error('Erro ao listar lotes da edição:', error);
    return res.status(500).json({ error: 'Erro ao listar os lotes de ingressos.' });
  }
};

// GET /api/lotes/:id - um lote específico, com a edição a que pertence
exports.buscarPorId = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do lote é inválido.' });
    }

    const lote = await prisma.lote.findUnique({
      where: { id_lote: id },
      include: {
        // A edição vem junto para o front-end saber se as vendas estão abertas
        // sem precisar de uma segunda requisição.
        geektopia: {
          select: {
            id_geektopia: true,
            nome_edicao: true,
            status_evento: true,
            data_inicio: true
          }
        },
        _count: { select: { ingressos: true } }
      }
    });

    const visivel =
      lote && (STATUS_PUBLICOS.includes(lote.geektopia.status_evento) || req.userIsAdmin === true);

    if (!visivel) {
      return res.status(404).json({ error: 'Lote de ingressos não encontrado.' });
    }

    return res.json(montarResposta(lote));
  } catch (error) {
    console.error('Erro ao buscar lote de ingressos:', error);
    return res.status(500).json({ error: 'Erro ao buscar o lote de ingressos.' });
  }
};

// POST /api/lotes - cadastra um lote vinculado a uma edição
// Corpo: { id_geektopia, nome_lote, valor_ingresso, quantidade_total }
exports.criar = async (req, res) => {
  try {
    // Quadro 43 - "Impedir lote sem Geektopia vinculada". O banco já recusaria
    // por violação de chave estrangeira, mas com uma mensagem incompreensível.
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
        error: 'Não é possível cadastrar o lote: a edição da Geektopia informada não existe.'
      });
    }

    // Edição encerrada é histórico e não deve receber lotes novos.
    if (edicao.status_evento === 'Encerrado') {
      return res.status(409).json({
        error: 'Não é possível cadastrar lotes em uma edição já encerrada.'
      });
    }

    const { erro, dados } = validarDados(req.body, true);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    const novo = await prisma.lote.create({
      data: { ...dados, id_geektopia: idGeektopia }
    });

    return res.status(201).json({
      message: 'Lote de ingressos cadastrado com sucesso!',
      lote: montarResposta(novo)
    });
  } catch (error) {
    console.error('Erro ao cadastrar lote de ingressos:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar o lote de ingressos.' });
  }
};

// PUT /api/lotes/:id - atualiza os campos enviados
exports.atualizar = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do lote é inválido.' });
    }

    // Mover um lote de edição deixaria os ingressos já emitidos apontando para
    // o evento errado. Recusamos com mensagem clara em vez de ignorar em silêncio.
    if (req.body.id_geektopia !== undefined) {
      return res.status(400).json({
        error: 'Não é permitido alterar a edição da Geektopia de um lote já cadastrado.'
      });
    }

    const { erro, dados } = validarDados(req.body, false);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const atual = await prisma.lote.findUnique({
      where: { id_lote: id },
      select: { _count: { select: { ingressos: true } } }
    });

    if (!atual) {
      return res.status(404).json({ error: 'Lote de ingressos não encontrado.' });
    }

    // Reduzir o estoque abaixo do que já foi emitido criaria uma inconsistência:
    // mais ingressos existentes do que a capacidade declarada do lote.
    if (dados.quantidade_total !== undefined && dados.quantidade_total < atual._count.ingressos) {
      return res.status(409).json({
        error:
          `Não é possível reduzir a quantidade para ${dados.quantidade_total}: ` +
          `já existem ${atual._count.ingressos} ingresso(s) emitido(s) neste lote.`
      });
    }

    const atualizado = await prisma.lote.update({
      where: { id_lote: id },
      data: dados
    });

    return res.json({
      message: 'Lote de ingressos atualizado com sucesso!',
      lote: montarResposta(atualizado)
    });
  } catch (error) {
    console.error('Erro ao atualizar lote de ingressos:', error);
    return res.status(500).json({ error: 'Erro ao atualizar o lote de ingressos.' });
  }
};

// DELETE /api/lotes/:id - remove um lote sem vínculos
exports.remover = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do lote é inválido.' });
    }

    const lote = await prisma.lote.findUnique({
      where: { id_lote: id },
      select: { _count: { select: { ingressos: true, itensPedido: true } } }
    });

    if (!lote) {
      return res.status(404).json({ error: 'Lote de ingressos não encontrado.' });
    }

    // Nem Ingresso nem Item_Pedido usam onDelete: Cascade no schema. Apagar o
    // lote destruiria histórico financeiro.
    if (lote._count.ingressos > 0 || lote._count.itensPedido > 0) {
      return res.status(409).json({
        error:
          'Não é possível excluir este lote porque já existem ingressos emitidos ou pedidos ' +
          'vinculados a ele. Para interromper as vendas, encerre as vendas da edição.',
        vinculos: {
          ingressos: lote._count.ingressos,
          itens_de_pedido: lote._count.itensPedido
        }
      });
    }

    await prisma.lote.delete({ where: { id_lote: id } });

    return res.json({ message: 'Lote de ingressos removido com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover lote de ingressos:', error);
    return res.status(500).json({ error: 'Erro ao remover o lote de ingressos.' });
  }
};
