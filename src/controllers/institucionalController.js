const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');

// Conteúdo institucional do CCPOP: história e galeria de edições passadas.

const ANO_MINIMO = 1900;
const ANO_MAXIMO = 2100;

// ---------- História ----------

// GET /api/institucional/historia
exports.listarHistoria = async (req, res) => {
  try {
    const historia = await prisma.historia_Institucional.findMany({
      orderBy: { id_historia: 'asc' }
    });

    return res.json(historia);
  } catch (error) {
    console.error('Erro ao listar a história institucional:', error);
    return res.status(500).json({ error: 'Erro ao carregar a história institucional.' });
  }
};

// GET /api/institucional/historia/:id
exports.buscarHistoria = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do texto é inválido.' });
    }

    const texto = await prisma.historia_Institucional.findUnique({
      where: { id_historia: id }
    });

    if (!texto) {
      return res.status(404).json({ error: 'Texto não encontrado.' });
    }

    return res.json(texto);
  } catch (error) {
    console.error('Erro ao buscar texto da história:', error);
    return res.status(500).json({ error: 'Erro ao buscar o texto.' });
  }
};

// Valida os campos de um texto da história.
function validarHistoria(corpo, ehCriacao) {
  const dados = {};

  if (ehCriacao || corpo.titulo !== undefined) {
    const titulo = lerTexto(corpo.titulo, 150);
    if (!titulo) {
      return { erro: 'O campo "titulo" é obrigatório e deve ter até 150 caracteres.' };
    }
    dados.titulo = titulo;
  }

  if (ehCriacao || corpo.texto_historia !== undefined) {
    const texto = lerTexto(corpo.texto_historia, 20000);
    if (!texto) {
      return { erro: 'O campo "texto_historia" é obrigatório e deve ter até 20000 caracteres.' };
    }
    dados.texto_historia = texto;
  }

  return { dados };
}

// POST /api/institucional/historia
exports.criarHistoria = async (req, res) => {
  try {
    const { erro, dados } = validarHistoria(req.body, true);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    const novo = await prisma.historia_Institucional.create({ data: dados });

    return res.status(201).json({ message: 'Texto cadastrado com sucesso!', historia: novo });
  } catch (error) {
    console.error('Erro ao cadastrar texto da história:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar o texto.' });
  }
};

// PUT /api/institucional/historia/:id
exports.atualizarHistoria = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do texto é inválido.' });
    }

    const { erro, dados } = validarHistoria(req.body, false);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const existe = await prisma.historia_Institucional.findUnique({
      where: { id_historia: id },
      select: { id_historia: true }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Texto não encontrado.' });
    }

    const atualizado = await prisma.historia_Institucional.update({
      where: { id_historia: id },
      data: dados
    });

    return res.json({ message: 'Texto atualizado com sucesso!', historia: atualizado });
  } catch (error) {
    console.error('Erro ao atualizar texto da história:', error);
    return res.status(500).json({ error: 'Erro ao atualizar o texto.' });
  }
};

// DELETE /api/institucional/historia/:id
exports.removerHistoria = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do texto é inválido.' });
    }

    const existe = await prisma.historia_Institucional.findUnique({
      where: { id_historia: id },
      select: { id_historia: true }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Texto não encontrado.' });
    }

    await prisma.historia_Institucional.delete({ where: { id_historia: id } });

    return res.json({ message: 'Texto removido com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover texto da história:', error);
    return res.status(500).json({ error: 'Erro ao remover o texto.' });
  }
};

// ---------- Galeria ----------

// GET /api/institucional/galeria?ano=
exports.listarGaleria = async (req, res) => {
  try {
    const filtro = {};

    if (req.query.ano !== undefined) {
      const ano = Number(req.query.ano);
      if (!Number.isInteger(ano) || ano < ANO_MINIMO || ano > ANO_MAXIMO) {
        return res.status(400).json({ error: 'O filtro "ano" é inválido.' });
      }
      filtro.ano = ano;
    }

    const galeria = await prisma.galeria_Edicoes_Passadas.findMany({
      where: filtro,
      orderBy: [{ ano: { sort: 'desc', nulls: 'last' } }, { id_galeria: 'desc' }]
    });

    return res.json(galeria);
  } catch (error) {
    console.error('Erro ao listar a galeria:', error);
    return res.status(500).json({ error: 'Erro ao carregar a galeria.' });
  }
};

// GET /api/institucional/galeria/:id
exports.buscarGaleria = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do item é inválido.' });
    }

    const item = await prisma.galeria_Edicoes_Passadas.findUnique({
      where: { id_galeria: id }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item da galeria não encontrado.' });
    }

    return res.json(item);
  } catch (error) {
    console.error('Erro ao buscar item da galeria:', error);
    return res.status(500).json({ error: 'Erro ao buscar o item.' });
  }
};

// Valida os campos de um item da galeria.
function validarGaleria(corpo, ehCriacao) {
  const dados = {};

  if (ehCriacao || corpo.nome_edicao_passada !== undefined) {
    const nome = lerTexto(corpo.nome_edicao_passada, 150);
    if (!nome) {
      return { erro: 'O campo "nome_edicao_passada" é obrigatório e deve ter até 150 caracteres.' };
    }
    dados.nome_edicao_passada = nome;
  }

  if (corpo.ano !== undefined) {
    if (corpo.ano === null) {
      dados.ano = null;
    } else {
      const ano = Number(corpo.ano);
      if (!Number.isInteger(ano) || ano < ANO_MINIMO || ano > ANO_MAXIMO) {
        return { erro: `O campo "ano" deve ser um ano entre ${ANO_MINIMO} e ${ANO_MAXIMO}.` };
      }
      dados.ano = ano;
    }
  }

  if (ehCriacao || corpo.url_foto !== undefined) {
    const url = lerTexto(corpo.url_foto, 2000);
    if (!url) {
      return { erro: 'O campo "url_foto" é obrigatório e deve conter uma URL válida.' };
    }
    dados.url_foto = url;
  }

  return { dados };
}

// POST /api/institucional/galeria
exports.criarGaleria = async (req, res) => {
  try {
    const { erro, dados } = validarGaleria(req.body, true);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    const novo = await prisma.galeria_Edicoes_Passadas.create({ data: dados });

    return res.status(201).json({ message: 'Item adicionado à galeria!', galeria: novo });
  } catch (error) {
    console.error('Erro ao cadastrar item da galeria:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar o item.' });
  }
};

// PUT /api/institucional/galeria/:id
exports.atualizarGaleria = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do item é inválido.' });
    }

    const { erro, dados } = validarGaleria(req.body, false);

    if (erro) {
      return res.status(400).json({ error: erro });
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const existe = await prisma.galeria_Edicoes_Passadas.findUnique({
      where: { id_galeria: id },
      select: { id_galeria: true }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Item da galeria não encontrado.' });
    }

    const atualizado = await prisma.galeria_Edicoes_Passadas.update({
      where: { id_galeria: id },
      data: dados
    });

    return res.json({ message: 'Item atualizado com sucesso!', galeria: atualizado });
  } catch (error) {
    console.error('Erro ao atualizar item da galeria:', error);
    return res.status(500).json({ error: 'Erro ao atualizar o item.' });
  }
};

// DELETE /api/institucional/galeria/:id
exports.removerGaleria = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do item é inválido.' });
    }

    const existe = await prisma.galeria_Edicoes_Passadas.findUnique({
      where: { id_galeria: id },
      select: { id_galeria: true }
    });

    if (!existe) {
      return res.status(404).json({ error: 'Item da galeria não encontrado.' });
    }

    await prisma.galeria_Edicoes_Passadas.delete({ where: { id_galeria: id } });

    return res.json({ message: 'Item removido da galeria!' });
  } catch (error) {
    console.error('Erro ao remover item da galeria:', error);
    return res.status(500).json({ error: 'Erro ao remover o item.' });
  }
};
