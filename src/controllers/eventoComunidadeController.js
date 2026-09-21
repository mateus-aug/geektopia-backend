const prisma = require('../config/prisma');
const { lerId, lerData, lerTexto } = require('../utils/validadores');
const { notificar, notificarAdmins } = require('../services/notificacoes');

// EVENTOS DA COMUNIDADE: quem organiza um evento fora da CCPOP envia o pedido de divulgação,
// a organização aprova (ou recusa com motivo) e só então decide se publica na página pública.
//
//   status_aprovacao  EmAnalise -> Aprovado | Reprovado   (decisão da organização)
//   publicado         só pode ser true se Aprovado         (a organização escolhe quando aparece)
//
// O dono vem SEMPRE de req.userId. Ninguém vê nem altera evento de outra pessoa.

const MAX_EM_ANALISE_POR_PESSOA = 5;
const VALIDOS = ['EmAnalise', 'Aprovado', 'Reprovado'];

const urlSegura = (v) => {
  if (v === undefined || v === null || v === '') return { valor: null };
  const t = lerTexto(v, 2000);
  if (!t) return { erro: 'O link "Saiba mais" é grande demais.' };
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocolo');
    return { valor: u.toString() };
  } catch {
    return { erro: 'O link "Saiba mais" precisa começar com http:// ou https://.' };
  }
};

function validarEvento(c) {
  const nome = lerTexto(c.nome_evento, 150);
  if (!nome) return { erro: 'Informe o nome do evento (até 150 caracteres).' };

  const inicio = lerData(c.data_evento);
  if (!inicio) return { erro: 'Informe a data do evento.' };
  if (inicio.getUTCFullYear() < 2000 || inicio.getUTCFullYear() > 2100) return { erro: 'A data do evento é irreal. Confira o ano.' };
  if (inicio.getTime() < Date.now() - 24 * 3600 * 1000) return { erro: 'A data do evento não pode estar no passado.' };

  let fim = null;
  if (c.data_fim) {
    fim = lerData(c.data_fim);
    if (!fim || fim < inicio) return { erro: 'A data de término deve ser igual ou depois do início.' };
  }

  const local = lerTexto(c.local, 200);
  if (!local) return { erro: 'Informe o local do evento (até 200 caracteres).' };

  const descricao = lerTexto(c.descricao, 3000);
  if (!descricao) return { erro: 'Escreva uma descrição do evento (até 3000 caracteres).' };

  // Sem link (Instagram, site, Drive) a organização não tem como avaliar o evento.
  if (!lerTexto(c.url_saiba_mais, 2000)) return { erro: 'Informe um link do evento ou do organizador (Instagram, site, Drive...) para a CCPOP poder avaliar.' };
  const url = urlSegura(c.url_saiba_mais);
  if (url.erro) return { erro: url.erro };

  const regras = c.regras_idade_minima ? lerTexto(c.regras_idade_minima, 1000) : null;
  if (c.regras_idade_minima && !regras) return { erro: 'As regras de idade têm até 1000 caracteres.' };

  return { dados: { nome_evento: nome, data_evento: inicio, data_fim: fim, local, descricao, url_saiba_mais: url.valor, regras_idade_minima: regras } };
}

const RESUMO_ORG = { select: { instituicao_empresa: true, usuario: { select: { nome_completo: true } } } };

// GET /api/eventos-comunidade - público: só o que foi aprovado E publicado, e ainda não terminou
exports.listarPublicos = async (req, res) => {
  try {
    const ontem = new Date(Date.now() - 24 * 3600 * 1000);
    const eventos = await prisma.evento_Externo.findMany({
      where: { status_aprovacao: 'Aprovado', publicado: true, OR: [{ data_fim: { gte: ontem } }, { data_fim: null, data_evento: { gte: ontem } }] },
      orderBy: { data_evento: 'asc' },
      select: { id_evento_externo: true, nome_evento: true, data_evento: true, data_fim: true, local: true, descricao: true, url_saiba_mais: true, regras_idade_minima: true, organizador: RESUMO_ORG }
    });
    return res.json(eventos);
  } catch (e) {
    console.error('Erro ao listar eventos da comunidade:', e);
    return res.status(500).json({ error: 'Erro ao listar os eventos da comunidade.' });
  }
};

// GET /api/eventos-comunidade/meus
exports.listarMeus = async (req, res) => {
  try {
    return res.json(await prisma.evento_Externo.findMany({ where: { id_organizador: req.userId }, orderBy: { criado_em: 'desc' } }));
  } catch (e) {
    console.error('Erro ao listar meus eventos:', e);
    return res.status(500).json({ error: 'Erro ao listar os seus eventos.' });
  }
};

// POST /api/eventos-comunidade - envia um evento para análise (cria o perfil de organizador na 1ª vez)
exports.enviar = async (req, res) => {
  try {
    const { erro, dados } = validarEvento(req.body || {});
    if (erro) return res.status(400).json({ error: erro });

    const org = await prisma.organizador_Externo.findUnique({ where: { id_usuario: req.userId } });
    if (org?.status_aprovacao === 'Reprovado') return res.status(403).json({ error: 'Seu perfil de organizador não está liberado para enviar eventos. Fale com a CCPOP.' });

    const abertos = await prisma.evento_Externo.count({ where: { id_organizador: req.userId, status_aprovacao: 'EmAnalise' } });
    if (abertos >= MAX_EM_ANALISE_POR_PESSOA) return res.status(429).json({ error: `Você já tem ${MAX_EM_ANALISE_POR_PESSOA} eventos aguardando análise. Espere a resposta da CCPOP para enviar mais.` });

    if (!org) {
      await prisma.organizador_Externo.create({
        data: { id_usuario: req.userId, status_aprovacao: 'Aprovado', instituicao_empresa: lerTexto(req.body.instituicao_empresa, 100) }
      });
    }
    const evento = await prisma.evento_Externo.create({ data: { ...dados, id_organizador: req.userId } });

    await notificarAdmins({ tipo: 'evento_comunidade', titulo: 'Novo evento da comunidade para analisar', texto: `"${evento.nome_evento}" aguarda a sua análise.`, link: '/admin/solicitacoes?tipo=comunidade' });
    return res.status(201).json({ message: 'Evento enviado! A CCPOP vai analisar e você será avisado.', evento });
  } catch (e) {
    console.error('Erro ao enviar evento da comunidade:', e);
    return res.status(500).json({ error: 'Erro ao enviar o evento.' });
  }
};

async function eventoDoDono(req, res) {
  const id = lerId(req.params.id);
  if (!id) { res.status(400).json({ error: 'O identificador do evento é inválido.' }); return null; }
  const ev = await prisma.evento_Externo.findUnique({ where: { id_evento_externo: id } });
  if (!ev || ev.id_organizador !== req.userId) { res.status(404).json({ error: 'Evento não encontrado.' }); return null; }
  return ev;
}

// PUT /api/eventos-comunidade/:id - editar; volta para análise (a organização precisa ver de novo)
exports.editar = async (req, res) => {
  try {
    const ev = await eventoDoDono(req, res); if (!ev) return;
    const { erro, dados } = validarEvento(req.body || {});
    if (erro) return res.status(400).json({ error: erro });
    const novo = await prisma.evento_Externo.update({ where: { id_evento_externo: ev.id_evento_externo }, data: { ...dados, status_aprovacao: 'EmAnalise', publicado: false, motivo_recusa: null } });
    await notificarAdmins({ tipo: 'evento_comunidade', titulo: 'Evento da comunidade atualizado', texto: `"${novo.nome_evento}" foi editado e aguarda nova análise.`, link: '/admin/solicitacoes?tipo=comunidade' });
    return res.json({ message: 'Alterações enviadas para nova análise.', evento: novo });
  } catch (e) {
    console.error('Erro ao editar evento da comunidade:', e);
    return res.status(500).json({ error: 'Erro ao editar o evento.' });
  }
};

// DELETE /api/eventos-comunidade/:id - o dono retira o pedido (evento publicado só a organização remove)
exports.remover = async (req, res) => {
  try {
    const ev = await eventoDoDono(req, res); if (!ev) return;
    if (ev.publicado) return res.status(409).json({ error: 'Este evento está publicado. Peça à CCPOP para retirá-lo.' });
    await prisma.evento_Externo.delete({ where: { id_evento_externo: ev.id_evento_externo } });
    return res.json({ message: 'Pedido removido.' });
  } catch (e) {
    console.error('Erro ao remover evento da comunidade:', e);
    return res.status(500).json({ error: 'Erro ao remover o evento.' });
  }
};

// ---------------------------------------------------------------- ADMIN

// GET /api/eventos-comunidade/admin/todos?status=EmAnalise
exports.listarTodos = async (req, res) => {
  try {
    const { status } = req.query;
    if (status && !VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const eventos = await prisma.evento_Externo.findMany({
      where: status ? { status_aprovacao: status } : {},
      orderBy: [{ criado_em: 'desc' }],
      include: { organizador: { select: { instituicao_empresa: true, usuario: { select: { nome_completo: true, email: true, telefone: true } } } } }
    });
    return res.json(eventos);
  } catch (e) {
    console.error('Erro ao listar eventos da comunidade (admin):', e);
    return res.status(500).json({ error: 'Erro ao listar os eventos.' });
  }
};

// PATCH /api/eventos-comunidade/admin/:id/status  { status, motivo? }  - recusar exige motivo
exports.alterarStatus = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador do evento é inválido.' });
    const { status } = req.body || {};
    if (!VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const motivo = lerTexto(req.body.motivo, 300);
    if (status === 'Reprovado' && !motivo) return res.status(400).json({ error: 'Explique o motivo da recusa (até 300 caracteres).' });

    const ev = await prisma.evento_Externo.findUnique({ where: { id_evento_externo: id } });
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado.' });

    // Só "Aprovado" pode ficar publicado; qualquer outra decisão tira da página pública.
    const novo = await prisma.evento_Externo.update({ where: { id_evento_externo: id }, data: { status_aprovacao: status, publicado: status === 'Aprovado' ? ev.publicado : false, motivo_recusa: status === 'Reprovado' ? motivo : null } });
    if (status !== ev.status_aprovacao && status !== 'EmAnalise') {
      await notificar(ev.id_organizador, {
        tipo: 'evento_comunidade',
        titulo: status === 'Aprovado' ? 'Seu evento foi aprovado' : 'Seu evento não foi aprovado',
        texto: status === 'Aprovado' ? `"${ev.nome_evento}" foi aprovado. A CCPOP vai avisar quando for publicado.` : `"${ev.nome_evento}": ${motivo}`,
        link: '/perfil'
      });
    }
    return res.json(novo);
  } catch (e) {
    console.error('Erro ao alterar status do evento da comunidade:', e);
    return res.status(500).json({ error: 'Erro ao alterar o status.' });
  }
};

// PATCH /api/eventos-comunidade/admin/:id/publicar  { publicado: boolean }
exports.publicar = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador do evento é inválido.' });
    if (typeof req.body?.publicado !== 'boolean') return res.status(400).json({ error: 'Informe "publicado" como true ou false.' });
    const ev = await prisma.evento_Externo.findUnique({ where: { id_evento_externo: id } });
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado.' });
    if (req.body.publicado && ev.status_aprovacao !== 'Aprovado') return res.status(409).json({ error: 'Só é possível publicar um evento aprovado.' });
    const novo = await prisma.evento_Externo.update({ where: { id_evento_externo: id }, data: { publicado: req.body.publicado } });
    if (novo.publicado && !ev.publicado) {
      await notificar(ev.id_organizador, { tipo: 'evento_comunidade', titulo: 'Seu evento foi publicado', texto: `"${ev.nome_evento}" já aparece em Eventos da comunidade.`, link: '/eventos' });
    }
    return res.json(novo);
  } catch (e) {
    console.error('Erro ao publicar evento da comunidade:', e);
    return res.status(500).json({ error: 'Erro ao publicar o evento.' });
  }
};
