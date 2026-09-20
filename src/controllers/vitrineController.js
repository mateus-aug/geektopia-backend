const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');
const { urlDoUpload, apagarArquivoLocal, descartarUpload } = require('../utils/arquivos');

// Conteúdo da vitrine pública de uma edição: convidados, fotos e expositores
// confirmados. O texto e a cor da edição vivem no geektopiaController.

// Mesma regra de visibilidade do resto do módulo: rascunho ('Bloqueado') é
// invisível ao público. O admin enxerga tudo pelas rotas /admin/...
const STATUS_PUBLICOS = ['VendasAbertas', 'VendasEncerradas', 'Encerrado'];

// Tetos de segurança, para uma edição não virar depósito de imagens.
const MAX_CONVIDADOS = 50;
const MAX_FOTOS = 40;

// Confere se a edição existe e se o solicitante pode vê-la.
// Devolve o mesmo 404 para "não existe" e "é rascunho", para não confirmar
// a existência de um rascunho a quem não é admin.
async function conferirEdicao(id, req) {
  const edicao = await prisma.geektopia.findUnique({
    where: { id_geektopia: id },
    select: { id_geektopia: true, status_evento: true }
  });

  const visivel = edicao && (STATUS_PUBLICOS.includes(edicao.status_evento) || req.userIsAdmin === true);
  return visivel ? edicao : null;
}

// Lê um texto opcional com limite. Vazio limpa o campo (null); passar do
// limite é erro, em vez de descartar o valor em silêncio.
function lerOpcional(corpo, campo, limite) {
  if (corpo[campo] === undefined) return { ausente: true };
  const texto = typeof corpo[campo] === 'string' ? corpo[campo].trim() : '';
  if (texto.length > limite) {
    return { erro: `O campo "${campo}" deve ter no máximo ${limite} caracteres.` };
  }
  return { valor: texto === '' ? null : texto };
}

function lerOrdem(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : null;
}

// Próximo número de ordem: coloca o item novo no fim da fila.
async function proximaOrdem(modelo, idGeektopia) {
  const ultimo = await prisma[modelo].aggregate({
    where: { id_geektopia: idGeektopia },
    _max: { ordem: true }
  });
  return (ultimo._max.ordem ?? -1) + 1;
}

// ==========================================================================
// CONVIDADOS
// ==========================================================================

function validarConvidado(corpo, ehCriacao) {
  const dados = {};

  if (ehCriacao || corpo.nome !== undefined) {
    const nome = lerTexto(corpo.nome, 150);
    if (!nome) {
      return { erro: 'O campo "nome" é obrigatório e deve ter até 150 caracteres.' };
    }
    dados.nome = nome;
  }

  for (const [campo, limite] of [['titulo_papel', 100], ['descricao', 2000]]) {
    const r = lerOpcional(corpo, campo, limite);
    if (r.erro) return { erro: r.erro };
    if (!r.ausente) dados[campo] = r.valor;
  }

  if (corpo.ordem !== undefined && corpo.ordem !== '') {
    const ordem = lerOrdem(corpo.ordem);
    if (ordem === null) {
      return { erro: 'O campo "ordem" deve ser um inteiro entre 0 e 9999.' };
    }
    dados.ordem = ordem;
  }

  return { dados };
}

// GET /api/geektopia/:id/convidados
// GET /api/geektopia/admin/:id/convidados (enxerga também rascunhos)
exports.listarConvidados = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador da edição é inválido.' });

    if (!(await conferirEdicao(id, req))) {
      return res.status(404).json({ error: 'Edição da Geektopia não encontrada.' });
    }

    const convidados = await prisma.convidado.findMany({
      where: { id_geektopia: id },
      orderBy: [{ ordem: 'asc' }, { id_convidado: 'asc' }]
    });

    return res.json(convidados);
  } catch (error) {
    console.error('Erro ao listar convidados:', error);
    return res.status(500).json({ error: 'Erro ao listar os convidados.' });
  }
};

// POST /api/convidados (multipart: id_geektopia, nome, titulo_papel?, descricao?, ordem?, foto?)
exports.criarConvidado = async (req, res) => {
  try {
    const idGeektopia = lerId(req.body.id_geektopia);
    if (!idGeektopia) {
      descartarUpload(req);
      return res.status(400).json({ error: 'O campo "id_geektopia" é obrigatório e deve ser válido.' });
    }

    const { erro, dados } = validarConvidado(req.body, true);
    if (erro) {
      descartarUpload(req);
      return res.status(400).json({ error: erro });
    }

    const edicao = await prisma.geektopia.findUnique({
      where: { id_geektopia: idGeektopia },
      select: { _count: { select: { convidados: true } } }
    });
    if (!edicao) {
      descartarUpload(req);
      return res.status(404).json({ error: 'A edição da Geektopia informada não existe.' });
    }
    if (edicao._count.convidados >= MAX_CONVIDADOS) {
      descartarUpload(req);
      return res.status(409).json({ error: `Limite de ${MAX_CONVIDADOS} convidados por edição atingido.` });
    }

    if (dados.ordem === undefined) dados.ordem = await proximaOrdem('convidado', idGeektopia);
    if (req.file) dados.foto_url = urlDoUpload(req, 'convidados', req.file);

    const convidado = await prisma.convidado.create({ data: { ...dados, id_geektopia: idGeektopia } });

    return res.status(201).json({ message: 'Convidado cadastrado com sucesso!', convidado });
  } catch (error) {
    descartarUpload(req);
    console.error('Erro ao cadastrar convidado:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar o convidado.' });
  }
};

// PUT /api/convidados/:id (multipart; foto nova substitui a antiga;
// remover_foto=true apaga a foto sem enviar outra)
exports.atualizarConvidado = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) {
      descartarUpload(req);
      return res.status(400).json({ error: 'O identificador do convidado é inválido.' });
    }

    const { erro, dados } = validarConvidado(req.body, false);
    if (erro) {
      descartarUpload(req);
      return res.status(400).json({ error: erro });
    }

    const atual = await prisma.convidado.findUnique({ where: { id_convidado: id } });
    if (!atual) {
      descartarUpload(req);
      return res.status(404).json({ error: 'Convidado não encontrado.' });
    }

    let fotoAntiga = null;
    if (req.file) {
      dados.foto_url = urlDoUpload(req, 'convidados', req.file);
      fotoAntiga = atual.foto_url;
    } else if (req.body.remover_foto === 'true') {
      dados.foto_url = null;
      fotoAntiga = atual.foto_url;
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const convidado = await prisma.convidado.update({ where: { id_convidado: id }, data: dados });
    apagarArquivoLocal(fotoAntiga);

    return res.json({ message: 'Convidado atualizado com sucesso!', convidado });
  } catch (error) {
    descartarUpload(req);
    console.error('Erro ao atualizar convidado:', error);
    return res.status(500).json({ error: 'Erro ao atualizar o convidado.' });
  }
};

// DELETE /api/convidados/:id
exports.removerConvidado = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador do convidado é inválido.' });

    const atual = await prisma.convidado.findUnique({ where: { id_convidado: id } });
    if (!atual) return res.status(404).json({ error: 'Convidado não encontrado.' });

    await prisma.convidado.delete({ where: { id_convidado: id } });
    apagarArquivoLocal(atual.foto_url);

    return res.json({ message: 'Convidado removido com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover convidado:', error);
    return res.status(500).json({ error: 'Erro ao remover o convidado.' });
  }
};

// ==========================================================================
// FOTOS DA EDIÇÃO (carrossel/galeria)
// ==========================================================================

// GET /api/geektopia/:id/fotos
// GET /api/geektopia/admin/:id/fotos
exports.listarFotos = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador da edição é inválido.' });

    if (!(await conferirEdicao(id, req))) {
      return res.status(404).json({ error: 'Edição da Geektopia não encontrada.' });
    }

    const fotos = await prisma.foto_Edicao.findMany({
      where: { id_geektopia: id },
      orderBy: [{ ordem: 'asc' }, { id_foto: 'asc' }]
    });

    return res.json(fotos);
  } catch (error) {
    console.error('Erro ao listar fotos da edição:', error);
    return res.status(500).json({ error: 'Erro ao listar as fotos da edição.' });
  }
};

// POST /api/fotos-edicao (multipart: id_geektopia, foto, legenda?)
exports.criarFoto = async (req, res) => {
  try {
    const idGeektopia = lerId(req.body.id_geektopia);
    if (!idGeektopia) {
      descartarUpload(req);
      return res.status(400).json({ error: 'O campo "id_geektopia" é obrigatório e deve ser válido.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Envie a imagem no campo "foto".' });
    }

    const legenda = lerOpcional(req.body, 'legenda', 200);
    if (legenda.erro) {
      descartarUpload(req);
      return res.status(400).json({ error: legenda.erro });
    }

    const edicao = await prisma.geektopia.findUnique({
      where: { id_geektopia: idGeektopia },
      select: { _count: { select: { fotos: true } } }
    });
    if (!edicao) {
      descartarUpload(req);
      return res.status(404).json({ error: 'A edição da Geektopia informada não existe.' });
    }
    if (edicao._count.fotos >= MAX_FOTOS) {
      descartarUpload(req);
      return res.status(409).json({ error: `Limite de ${MAX_FOTOS} fotos por edição atingido.` });
    }

    const foto = await prisma.foto_Edicao.create({
      data: {
        id_geektopia: idGeektopia,
        url_foto: urlDoUpload(req, 'galeria', req.file),
        legenda: legenda.ausente ? null : legenda.valor,
        ordem: await proximaOrdem('foto_Edicao', idGeektopia)
      }
    });

    return res.status(201).json({ message: 'Foto adicionada com sucesso!', foto });
  } catch (error) {
    descartarUpload(req);
    console.error('Erro ao adicionar foto da edição:', error);
    return res.status(500).json({ error: 'Erro ao adicionar a foto.' });
  }
};

// PUT /api/fotos-edicao/:id - só legenda e ordem (a imagem em si não troca:
// para outra imagem, remova e adicione de novo)
exports.atualizarFoto = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador da foto é inválido.' });

    const dados = {};

    const legenda = lerOpcional(req.body, 'legenda', 200);
    if (legenda.erro) return res.status(400).json({ error: legenda.erro });
    if (!legenda.ausente) dados.legenda = legenda.valor;

    if (req.body.ordem !== undefined) {
      const ordem = lerOrdem(req.body.ordem);
      if (ordem === null) {
        return res.status(400).json({ error: 'O campo "ordem" deve ser um inteiro entre 0 e 9999.' });
      }
      dados.ordem = ordem;
    }

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    const existe = await prisma.foto_Edicao.findUnique({ where: { id_foto: id }, select: { id_foto: true } });
    if (!existe) return res.status(404).json({ error: 'Foto não encontrada.' });

    const foto = await prisma.foto_Edicao.update({ where: { id_foto: id }, data: dados });
    return res.json({ message: 'Foto atualizada com sucesso!', foto });
  } catch (error) {
    console.error('Erro ao atualizar foto da edição:', error);
    return res.status(500).json({ error: 'Erro ao atualizar a foto.' });
  }
};

// DELETE /api/fotos-edicao/:id
exports.removerFoto = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador da foto é inválido.' });

    const atual = await prisma.foto_Edicao.findUnique({ where: { id_foto: id } });
    if (!atual) return res.status(404).json({ error: 'Foto não encontrada.' });

    await prisma.foto_Edicao.delete({ where: { id_foto: id } });
    apagarArquivoLocal(atual.url_foto);

    return res.json({ message: 'Foto removida com sucesso!' });
  } catch (error) {
    console.error('Erro ao remover foto da edição:', error);
    return res.status(500).json({ error: 'Erro ao remover a foto.' });
  }
};

// ==========================================================================
// REORDENAR (convidados e fotos)
// ==========================================================================

// Cria o handler de reordenação para um modelo. Corpo:
//   { id_geektopia, ids: [3, 1, 2] }  -> a posição no array vira a ordem.
// A lista precisa conter EXATAMENTE os itens da edição: uma lista parcial
// deixaria a ordem inconsistente com o que o admin vê na tela.
function criarReordenador(modelo, campoId) {
  return async (req, res) => {
    try {
      const idGeektopia = lerId(req.body.id_geektopia);
      const ids = req.body.ids;

      if (!idGeektopia) {
        return res.status(400).json({ error: 'O campo "id_geektopia" é obrigatório e deve ser válido.' });
      }
      if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => lerId(i))) {
        return res.status(400).json({ error: 'O campo "ids" deve ser uma lista de identificadores válidos.' });
      }
      if (new Set(ids).size !== ids.length) {
        return res.status(400).json({ error: 'O campo "ids" contém identificadores repetidos.' });
      }

      const existentes = await prisma[modelo].findMany({
        where: { id_geektopia: idGeektopia },
        select: { [campoId]: true }
      });
      const idsDaEdicao = new Set(existentes.map((e) => e[campoId]));

      if (idsDaEdicao.size !== ids.length || !ids.every((i) => idsDaEdicao.has(Number(i)))) {
        return res.status(400).json({
          error: 'A lista deve conter exatamente os itens desta edição (recarregue a tela e tente de novo).'
        });
      }

      await prisma.$transaction(
        ids.map((i, posicao) =>
          prisma[modelo].update({ where: { [campoId]: Number(i) }, data: { ordem: posicao } })
        )
      );

      return res.json({ message: 'Ordem atualizada com sucesso!' });
    } catch (error) {
      console.error(`Erro ao reordenar ${modelo}:`, error);
      return res.status(500).json({ error: 'Erro ao reordenar.' });
    }
  };
}

exports.reordenarConvidados = criarReordenador('convidado', 'id_convidado');
exports.reordenarFotos = criarReordenador('foto_Edicao', 'id_foto');

// ==========================================================================
// EXPOSITORES CONFIRMADOS (vitrine pública)
// ==========================================================================

// GET /api/geektopia/:id/expositores-confirmados
//
// "Confirmado" = a diretoria APROVOU a solicitação de espaço E o pedido da
// taxa está PAGO. Aprovado sem pagamento ainda não garante a presença.
//
// Só devolve o que é feito para o público (nome, tipo, logo, link do
// portfólio). Nunca dados pessoais: CPF, e-mail, telefone, ajudantes.
exports.listarExpositoresConfirmados = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador da edição é inválido.' });

    if (!(await conferirEdicao(id, req))) {
      return res.status(404).json({ error: 'Edição da Geektopia não encontrada.' });
    }

    const solicitacoes = await prisma.solicitacao_Espaco.findMany({
      where: {
        id_geektopia: id,
        status_solicitacao: 'Aprovado',
        pedido: { is: { status_pedido: 'Pago' } }
      },
      select: {
        id_solicitacao: true,
        espaco: { select: { tipo_espaco: true } },
        expositor: {
          select: { nome_loja_projeto: true, tipo_expositor: true, url_portfolio: true, url_logo: true }
        }
      },
      orderBy: { id_solicitacao: 'asc' }
    });

    // O link é digitado pelo expositor. Só passa http(s), para a vitrine
    // nunca receber um "javascript:" num href.
    const linkSeguro = (url) => (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null);

    const expositores = solicitacoes.map((s) => ({
      id_solicitacao: s.id_solicitacao,
      nome: s.expositor.nome_loja_projeto,
      tipo: s.expositor.tipo_expositor,
      tipo_espaco: s.espaco.tipo_espaco,
      logo_url: s.expositor.url_logo,
      link: linkSeguro(s.expositor.url_portfolio)
    }));

    return res.json(expositores);
  } catch (error) {
    console.error('Erro ao listar expositores confirmados:', error);
    return res.status(500).json({ error: 'Erro ao listar os expositores confirmados.' });
  }
};
