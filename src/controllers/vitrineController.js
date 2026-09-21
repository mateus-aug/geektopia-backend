const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');
const { urlDoUpload, apagarArquivoLocal, descartarUpload } = require('../utils/arquivos');
const { conteudoGeektopia } = require('./conteudoController');

// Conteúdo da vitrine pública de uma edição: convidados, fotos e expositores
// confirmados. O texto e a cor da edição vivem no geektopiaController.

// Mesma regra de visibilidade do resto do módulo: rascunho ('Bloqueado') é
// invisível ao público. O admin enxerga tudo pelas rotas /admin/...
const STATUS_PUBLICOS = ['VendasAbertas', 'VendasEncerradas', 'Encerrado'];

// Tetos de segurança, para uma edição não virar depósito de imagens.
const MAX_CONVIDADOS = 50;
const MAX_FOTOS = 12; // o carrossel público mostra poucas fotos, bem escolhidas

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
    // A mesma imagem pode estar no carrossel do site: só apaga o arquivo se ninguém mais usa.
    if ((await prisma.foto_Site.count({ where: { url_foto: atual.url_foto } })) === 0) apagarArquivoLocal(atual.url_foto);

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

    const expositores = await expositoresConfirmadosDe(id);

    return res.json(expositores);
  } catch (error) {
    console.error('Erro ao listar expositores confirmados:', error);
    return res.status(500).json({ error: 'Erro ao listar os expositores confirmados.' });
  }
};

// ==========================================================================
// VITRINE PÚBLICA (página /geektopia)
// ==========================================================================

// Expositores confirmados de uma edição (aprovado + taxa paga). Só o que é
// feito para o público; nunca dados pessoais.
async function expositoresConfirmadosDe(idGeektopia) {
  const solicitacoes = await prisma.solicitacao_Espaco.findMany({
    where: { id_geektopia: idGeektopia, status_solicitacao: 'Aprovado', pedido: { is: { status_pedido: 'Pago' } } },
    select: {
      id_solicitacao: true,
      espaco: { select: { tipo_espaco: true } },
      expositor: { select: { nome_loja_projeto: true, tipo_expositor: true, url_portfolio: true, url_logo: true } }
    },
    orderBy: { id_solicitacao: 'asc' }
  });

  return solicitacoes.map((s) => ({
    id_solicitacao: s.id_solicitacao,
    nome: s.expositor.nome_loja_projeto,
    tipo: s.expositor.tipo_expositor,
    tipo_espaco: s.espaco.tipo_espaco,
    logo_url: s.expositor.url_logo,
    link: /^https?:\/\//i.test(s.expositor.url_portfolio || '') ? s.expositor.url_portfolio : null
  }));
}

// Resumo de preço/disponibilidade dos lotes de várias edições, numa consulta só.
// `restantes` segue a mesma conta do pedido: capacidade menos ingressos emitidos.
async function resumoDeIngressos(idsGeektopia) {
  const lotes = await prisma.lote.findMany({
    where: { id_geektopia: { in: idsGeektopia } },
    select: { id_geektopia: true, valor_ingresso: true, quantidade_total: true, _count: { select: { ingressos: true } } }
  });

  const porEdicao = new Map(idsGeektopia.map((id) => [id, { qtd_lotes: 0, preco_a_partir: null, esgotado: false }]));

  for (const l of lotes) {
    const r = porEdicao.get(l.id_geektopia);
    r.qtd_lotes += 1;
    const restantes = l.quantidade_total === null ? Infinity : l.quantidade_total - l._count.ingressos;
    if (restantes > 0) {
      const valor = Number(l.valor_ingresso);
      if (r.preco_a_partir === null || valor < r.preco_a_partir) r.preco_a_partir = valor;
    }
  }
  for (const r of porEdicao.values()) r.esgotado = r.qtd_lotes > 0 && r.preco_a_partir === null;

  return porEdicao;
}

// GET /api/geektopia/vitrine
//
// Tudo o que a página pública precisa, numa chamada só:
//   destaque  a Principal vigente; enquanto ela não for publicada, a
//             Principal anterior mais recente (a página nunca fica vazia)
//   galeria   fotos das Principais anteriores (limitadas)
//   pockets   as edições menores publicadas, já com preço "a partir de"
// Rascunhos nunca aparecem.
exports.vitrinePublica = async (req, res) => {
  try {
    const publicas = { status_evento: { in: STATUS_PUBLICOS } };
    const maisRecente = { data_inicio: { sort: 'desc', nulls: 'last' } };

    // Sem Principal publicada não há destaque: a página mostra "próxima edição em <ano>".
    // (A edição anterior alimenta só a galeria; não é apresentada como se fosse a atual.)
    const edicao = await prisma.geektopia.findFirst({ where: { ...publicas, tipo_edicao: 'Principal' } });
    const origem = 'Principal';

    // A Geektopia é anual: se este ano já teve (ou não há edição em andamento), a próxima é no ano que vem.
    const proximaEdicaoAno = new Date().getFullYear() + 1;

    const pockets = await prisma.geektopia.findMany({
      // Pocket encerrado sai da página (continua acessível pelo link direto do evento).
      where: { tipo_edicao: 'Pocket', status_evento: { in: STATUS_PUBLICOS.filter((s) => s !== 'Encerrado') } },
      select: {
        id_geektopia: true, nome_edicao: true, data_inicio: true, data_fim: true, local: true,
        banner_url: true, banner_fundo: true, status_evento: true, classificacao_etaria: true, tagline: true, cor_destaque: true
      },
      orderBy: maisRecente
    });

    const idsParaResumo = [...pockets.map((p) => p.id_geektopia), ...(edicao ? [edicao.id_geektopia] : [])];
    const resumos = await resumoDeIngressos(idsParaResumo);

    // O carrossel e os textos gerais são da página, não da edição: criar outro evento não os altera.
    const fotos = await prisma.foto_Site.findMany({ where: { area: 'geektopia' }, orderBy: [{ ordem: 'asc' }, { id_foto: 'asc' }], take: MAX_FOTOS });
    const conteudo = await conteudoGeektopia();

    let destaque = null;
    if (edicao) {
      const [convidados, expositores, competicoes] = await Promise.all([
        prisma.convidado.findMany({ where: { id_geektopia: edicao.id_geektopia }, orderBy: [{ ordem: 'asc' }, { id_convidado: 'asc' }] }),
        expositoresConfirmadosDe(edicao.id_geektopia),
        prisma.competicao.findMany({
          where: { id_geektopia: edicao.id_geektopia },
          select: { id_competicao: true, nome_competicao: true, modalidade: true, valor_taxa_inscricao: true, descricao: true },
          orderBy: { nome_competicao: 'asc' }
        })
      ]);

      destaque = {
        ...edicao,
        origem,
        ingressos: resumos.get(edicao.id_geektopia),
        convidados,
        expositores,
        competicoes: competicoes.map((c) => ({
          ...c,
          valor_taxa_inscricao: c.valor_taxa_inscricao === null ? null : Number(c.valor_taxa_inscricao)
        }))
      };
    }

    return res.json({
      destaque,
      proxima_edicao_ano: destaque ? null : proximaEdicaoAno,
      galeria: fotos.map((f) => ({ id_foto: f.id_foto, url_foto: f.url_foto, legenda: f.legenda })),
      conteudo,
      pockets: pockets.map((p) => ({ ...p, ingressos: resumos.get(p.id_geektopia) }))
    });
  } catch (error) {
    console.error('Erro ao montar a vitrine pública:', error);
    return res.status(500).json({ error: 'Erro ao carregar a página da Geektopia.' });
  }
};
