const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');

// Colunas DECIMAL da tabela. O Prisma devolve objeto Decimal nelas, que não
// vira número comum no JSON — precisam de conversão explícita na resposta.
const CAMPOS_DECIMAIS = [
  'largura_espaco',
  'comprimento_espaco',
  'largura_mesa',
  'comprimento_mesa',
  'valor_base',
  'valor_taxa_ajudante',
  'valor_taxa_mesa_extra',
  'valor_taxa_cadeira_extra'
];

// Limites das colunas: DECIMAL(5,2) para medidas, DECIMAL(10,2) para valores.
const MEDIDA_MAXIMA = 1000;
const VALOR_MAXIMO = 100000000;

// Converte um Decimal do Prisma em número. O teste de null vem antes porque
// Number(null) daria zero, transformando "não informado" em "grátis" ou "0 m".
const paraNumero = (v) => (v === null || v === undefined ? null : Number(v));

// Monta a resposta de um espaço.
function montarResposta(espaco) {
  const { _count, ...campos } = espaco;
  const resposta = { ...campos };

  for (const campo of CAMPOS_DECIMAIS) {
    resposta[campo] = paraNumero(espaco[campo]);
  }

  // Campo calculado, não existe no banco. Só é possível porque o schema guarda
  // largura e comprimento como números — no PDF eram um texto tipo "3x3", com
  // o qual nenhuma conta seria possível.
  resposta.area_m2 =
    resposta.largura_espaco !== null && resposta.comprimento_espaco !== null
      ? Math.round(resposta.largura_espaco * resposta.comprimento_espaco * 100) / 100
      : null;

  if (_count) {
    resposta.qtd_solicitacoes = _count.solicitacoes;
  }

  return resposta;
}

// Confere um número opcional que não pode ser negativo.
// Devolve { erro } ou { valor }, sendo `valor` undefined quando não foi enviado.
function lerNumero(corpo, campo, limite, precisaSerInteiro) {
  if (corpo[campo] === undefined) return { valor: undefined };

  // null limpa o campo, que é opcional no schema.
  if (corpo[campo] === null) return { valor: null };

  const n = Number(corpo[campo]);

  if (!Number.isFinite(n) || n < 0) {
    return { erro: `O campo "${campo}" deve ser um número maior ou igual a zero.` };
  }

  if (precisaSerInteiro && !Number.isInteger(n)) {
    return { erro: `O campo "${campo}" deve ser um número inteiro.` };
  }

  // Arredonda para 2 casas, que é o que as colunas DECIMAL guardam.
  const valor = precisaSerInteiro ? n : Math.round(n * 100) / 100;

  if (valor >= limite) {
    return { erro: `O campo "${campo}" excede o valor máximo permitido.` };
  }

  return { valor };
}

// Valida os campos enviados. Só devolve o que veio no corpo, para o PUT
// conseguir alterar um campo sem apagar os outros.
function validarDados(corpo, ehCriacao) {
  const dados = {};

  // O schema permite tipo nulo, mas espaço sem nome não tem como ser
  // apresentado ao expositor. Exigimos no cadastro.
  if (ehCriacao || corpo.tipo_espaco !== undefined) {
    const tipo = lerTexto(corpo.tipo_espaco, 100);
    if (!tipo) {
      return { erro: 'O campo "tipo_espaco" é obrigatório e deve ter até 100 caracteres.' };
    }
    dados.tipo_espaco = tipo;
  }

  // Cada espaço pertence a uma edição: mesa 2m da Geektopia X não é a mesma mesa
  // da Geektopia Halloween (mudam o local, o layout e o preço).
  if (ehCriacao || corpo.id_geektopia !== undefined) {
    const idGeektopia = lerId(corpo.id_geektopia);
    if (!idGeektopia) {
      return { erro: 'O campo "id_geektopia" é obrigatório: escolha a edição a que o espaço pertence.' };
    }
    dados.id_geektopia = idGeektopia;
  }

  const numericos = [
    ['largura_espaco', MEDIDA_MAXIMA, false],
    ['comprimento_espaco', MEDIDA_MAXIMA, false],
    ['largura_mesa', MEDIDA_MAXIMA, false],
    ['comprimento_mesa', MEDIDA_MAXIMA, false],
    ['qtd_mesas', VALOR_MAXIMO, true],
    ['quantidade_cadeiras', VALOR_MAXIMO, true],
    ['qtd_credenciais_inclusas', VALOR_MAXIMO, true],
    ['valor_base', VALOR_MAXIMO, false],
    ['valor_taxa_ajudante', VALOR_MAXIMO, false],
    ['valor_taxa_mesa_extra', VALOR_MAXIMO, false],
    ['valor_taxa_cadeira_extra', VALOR_MAXIMO, false]
  ];

  for (const [campo, limite, inteiro] of numericos) {
    const r = lerNumero(corpo, campo, limite, inteiro);
    if (r.erro) return { erro: r.erro };
    if (r.valor !== undefined) dados[campo] = r.valor;
  }

  if (corpo.descricao !== undefined) {
    dados.descricao = corpo.descricao === null ? null : lerTexto(corpo.descricao, 10000);
  }

  return { dados };
}

// GET /api/espacos?id_geektopia=7 - espaços de uma edição
//
// O expositor precisa ver os preços antes de se candidatar, então a consulta é
// pública. Sem o filtro devolve todos (uso do painel); ?id_geektopia=... traz
// só os da edição escolhida.
exports.listar = async (req, res) => {
  try {
    const where = {};
    if (req.query.id_geektopia !== undefined) {
      const idGeektopia = lerId(req.query.id_geektopia);
      if (!idGeektopia) return res.status(400).json({ error: 'O filtro "id_geektopia" é inválido.' });
      where.id_geektopia = idGeektopia;
    }

    const espacos = await prisma.espaco.findMany({
      where,
      // Do mais barato para o mais caro: é a ordem esperada num catálogo.
      orderBy: { valor_base: 'asc' }
    });

    return res.json(espacos.map(montarResposta));
  } catch (error) {
    console.error('Erro ao listar espaços:', error);
    return res.status(500).json({ error: 'Erro ao listar os espaços disponíveis.' });
  }
};

// GET /api/espacos/:id - um tipo de espaço específico
exports.buscarPorId = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do espaço é inválido.' });
    }

    const espaco = await prisma.espaco.findUnique({
      where: { id_espaco: id },
      include: { _count: { select: { solicitacoes: true } } }
    });

    if (!espaco) {
      return res.status(404).json({ error: 'Espaço não encontrado.' });
    }

    return res.json(montarResposta(espaco));
  } catch (error) {
    console.error('Erro ao buscar espaço:', error);
    return res.status(500).json({ error: 'Erro ao buscar o espaço.' });
  }
};

// POST /api/espacos - cadastra um tipo de espaço no catálogo
exports.criar = async (req, res) => {
  try {
    const { erro, dados } = validarDados(req.body, true);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    const edicao = await prisma.geektopia.findUnique({ where: { id_geektopia: dados.id_geektopia }, select: { id_geektopia: true } });
    if (!edicao) {
      return res.status(404).json({ error: 'A edição informada não existe.' });
    }

    const novo = await prisma.espaco.create({ data: dados });

    return res.status(201).json({
      message: 'Espaço cadastrado com sucesso!',
      espaco: montarResposta(novo)
    });
  } catch (error) {
    console.error('Erro ao cadastrar espaço:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar o espaço.' });
  }
};

// PUT /api/espacos/:id - atualiza os campos enviados
//
// Os preços podem ser alterados livremente, mesmo havendo solicitações.
// Diferente da competição, a Solicitacao_Espaco copia as taxas para as
// colunas terminadas em "_momento" quando o expositor se candidata, então
// quem já pediu continua com o valor que foi combinado.
exports.atualizar = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do espaço é inválido.' });
    }

    const { erro, dados } = validarDados(req.body, false);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const existe = await prisma.espaco.findUnique({
      where: { id_espaco: id },
      select: { id_espaco: true, id_geektopia: true, _count: { select: { solicitacoes: true } } }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Espaço não encontrado.' });
    }

    if (dados.id_geektopia !== undefined && dados.id_geektopia !== existe.id_geektopia) {
      if (existe._count.solicitacoes > 0) {
        return res.status(409).json({ error: 'Este espaço já tem solicitações de expositores e não pode mudar de edição.' });
      }
      const edicao = await prisma.geektopia.findUnique({ where: { id_geektopia: dados.id_geektopia }, select: { id_geektopia: true } });
      if (!edicao) return res.status(404).json({ error: 'A edição informada não existe.' });
    }

    const atualizado = await prisma.espaco.update({
      where: { id_espaco: id },
      data: dados
    });

    return res.json({
      message: 'Espaço atualizado com sucesso!',
      espaco: montarResposta(atualizado)
    });
  } catch (error) {
    console.error('Erro ao atualizar espaço:', error);
    return res.status(500).json({ error: 'Erro ao atualizar o espaço.' });
  }
};

// DELETE /api/espacos/:id - remove um tipo do catálogo
//
// Solicitacao_Espaco usa ON DELETE RESTRICT: o banco recusaria com um erro
// incompreensível. Conferimos antes para devolver uma mensagem clara.
exports.remover = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do espaço é inválido.' });
    }

    const espaco = await prisma.espaco.findUnique({
      where: { id_espaco: id },
      select: { _count: { select: { solicitacoes: true } } }
    });

    if (!espaco) {
      return res.status(404).json({ error: 'Espaço não encontrado.' });
    }

    if (espaco._count.solicitacoes > 0) {
      return res.status(409).json({
        error:
          `Não é possível excluir este espaço porque existem ${espaco._count.solicitacoes} ` +
          'solicitação(ões) de expositor vinculadas a ele.',
        vinculos: { solicitacoes: espaco._count.solicitacoes }
      });
    }

    await prisma.espaco.delete({ where: { id_espaco: id } });

    return res.json({ message: 'Espaço removido com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover espaço:', error);
    return res.status(500).json({ error: 'Erro ao remover o espaço.' });
  }
};

// POST /api/espacos/copiar - reaproveita os espaços de uma edição em outra
// Corpo: { de_geektopia, para_geektopia }. Copia medidas, itens e preços; a
// diretoria ajusta depois o que mudou. Não copia se já houver espaço igual (mesmo nome) no destino.
exports.copiar = async (req, res) => {
  try {
    const de = lerId(req.body.de_geektopia);
    const para = lerId(req.body.para_geektopia);
    if (!de || !para || de === para) {
      return res.status(400).json({ error: 'Informe duas edições diferentes: "de_geektopia" e "para_geektopia".' });
    }

    const [origem, destino] = await Promise.all([
      prisma.espaco.findMany({ where: { id_geektopia: de } }),
      prisma.espaco.findMany({ where: { id_geektopia: para }, select: { tipo_espaco: true } })
    ]);
    const jaTem = new Set(destino.map((e) => (e.tipo_espaco || '').toLowerCase()));
    const copiar = origem.filter((e) => !jaTem.has((e.tipo_espaco || '').toLowerCase()));

    if (copiar.length === 0) {
      return res.status(409).json({ error: origem.length === 0 ? 'A edição de origem não tem espaços cadastrados.' : 'A edição de destino já tem todos esses espaços.' });
    }

    await prisma.espaco.createMany({
      data: copiar.map(({ id_espaco, ...resto }) => ({ ...resto, id_geektopia: para }))
    });

    return res.status(201).json({ message: `${copiar.length} espaço(s) copiado(s).`, copiados: copiar.length });
  } catch (error) {
    console.error('Erro ao copiar espaços:', error);
    return res.status(500).json({ error: 'Erro ao copiar os espaços.' });
  }
};
