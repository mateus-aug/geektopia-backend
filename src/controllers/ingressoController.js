const prisma = require('../config/prisma');
const { lerId } = require('../utils/validadores');

// Dados incluídos em toda consulta de ingresso: o essencial para o usuário
// reconhecer o evento e o lote sem precisar de uma segunda requisição.
const INCLUDE_PADRAO = {
  lote: { select: { id_lote: true, nome_lote: true, valor_ingresso: true } },
  geektopia: {
    select: {
      id_geektopia: true,
      nome_edicao: true,
      data_inicio: true,
      data_fim: true,
      local: true,
      banner_url: true,
      status_evento: true
    }
  }
};

// Monta a resposta de um ingresso, convertendo o Decimal do lote em número.
function montarResposta(ingresso) {
  const { lote, ...campos } = ingresso;

  return {
    ...campos,
    lote: lote ? { ...lote, valor_ingresso: lote.valor_ingresso === null ? null : Number(lote.valor_ingresso) } : null
  };
}

// GET /api/ingressos/meus - ingressos do usuário logado ("Meus Ingressos")
exports.listarMeus = async (req, res) => {
  try {
    const ingressos = await prisma.ingresso.findMany({
      where: { id_usuario: req.userId },
      orderBy: { id_ingresso: 'desc' },
      include: INCLUDE_PADRAO
    });

    return res.json(ingressos.map(montarResposta));
  } catch (error) {
    console.error('Erro ao listar ingressos do usuário:', error);
    return res.status(500).json({ error: 'Erro ao listar os ingressos.' });
  }
};

// GET /api/ingressos/:id - detalhe de um ingresso, usado para exibir o QR
// Code em destaque na hora do check-in. Só o dono do ingresso ou um admin
// pode consultar.
exports.buscarPorId = async (req, res) => {
  try {
    const id = lerId(req.params.id);

    if (!id) {
      return res.status(400).json({ error: 'O identificador do ingresso é inválido.' });
    }

    const ingresso = await prisma.ingresso.findUnique({
      where: { id_ingresso: id },
      include: INCLUDE_PADRAO
    });

    if (!ingresso) {
      return res.status(404).json({ error: 'Ingresso não encontrado.' });
    }

    if (ingresso.id_usuario !== req.userId && !req.userIsAdmin) {
      return res.status(403).json({ error: 'Você não tem permissão para ver este ingresso.' });
    }

    return res.json(montarResposta(ingresso));
  } catch (error) {
    console.error('Erro ao buscar ingresso:', error);
    return res.status(500).json({ error: 'Erro ao buscar o ingresso.' });
  }
};

// POST /api/ingressos/checkin - valida um ingresso na entrada do evento.
//
// Uso da equipe da portaria: lê o código do QR Code do ingresso (o mesmo
// texto salvo em `codigo_qr`) e, se ainda estiver válido, marca como
// utilizado. Só admin pode chamar essa rota (ver adminMiddleware na rota).
exports.registrarCheckin = async (req, res) => {
  try {
    const codigoQr = typeof req.body.codigo_qr === 'string' ? req.body.codigo_qr.trim() : '';

    if (!codigoQr) {
      return res.status(400).json({ error: 'O campo "codigo_qr" é obrigatório.' });
    }

    const ingresso = await prisma.ingresso.findUnique({
      where: { codigo_qr: codigoQr },
      include: INCLUDE_PADRAO
    });

    if (!ingresso) {
      return res.status(404).json({ error: 'Ingresso não encontrado. Confira se o QR Code é válido.' });
    }

    if (ingresso.status_ingresso === 'Cancelado') {
      return res.status(409).json({
        error: 'Este ingresso foi cancelado e não dá mais acesso ao evento.',
        ingresso: montarResposta(ingresso)
      });
    }

    if (ingresso.status_ingresso === 'Utilizado') {
      return res.status(409).json({
        error: 'Este ingresso já foi utilizado — não pode entrar de novo com o mesmo QR Code.',
        ingresso: montarResposta(ingresso)
      });
    }

    const atualizado = await prisma.ingresso.update({
      where: { id_ingresso: ingresso.id_ingresso },
      data: { status_ingresso: 'Utilizado', data_checkin: new Date() },
      include: INCLUDE_PADRAO
    });

    return res.json({ message: 'Check-in realizado com sucesso!', ingresso: montarResposta(atualizado) });
  } catch (error) {
    console.error('Erro ao realizar check-in do ingresso:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar o check-in.' });
  }
};
