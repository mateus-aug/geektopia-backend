const prisma = require('../config/prisma');
const { lerId } = require('../utils/validadores');

// GET /api/notificacoes — as 30 mais recentes de quem está logado + quantas não foram lidas
exports.listar = async (req, res) => {
  try {
    const [itens, naoLidas] = await Promise.all([
      prisma.notificacao.findMany({ where: { id_usuario: req.userId }, orderBy: { criada_em: 'desc' }, take: 30 }),
      prisma.notificacao.count({ where: { id_usuario: req.userId, lida: false } })
    ]);
    return res.json({ itens, nao_lidas: naoLidas });
  } catch (error) {
    console.error('Erro ao listar notificações:', error);
    return res.status(500).json({ error: 'Erro ao carregar as notificações.' });
  }
};

// PATCH /api/notificacoes/:id/lida
exports.marcarLida = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador da notificação é inválido.' });
    const r = await prisma.notificacao.updateMany({ where: { id_notificacao: id, id_usuario: req.userId }, data: { lida: true } });
    if (r.count === 0) return res.status(404).json({ error: 'Notificação não encontrada.' });
    return res.json({ message: 'Notificação marcada como lida.' });
  } catch (error) {
    console.error('Erro ao marcar notificação:', error);
    return res.status(500).json({ error: 'Erro ao atualizar a notificação.' });
  }
};

// PATCH /api/notificacoes/lidas — marca todas como lidas
exports.marcarTodasLidas = async (req, res) => {
  try {
    await prisma.notificacao.updateMany({ where: { id_usuario: req.userId, lida: false }, data: { lida: true } });
    return res.json({ message: 'Todas as notificações foram marcadas como lidas.' });
  } catch (error) {
    console.error('Erro ao marcar notificações:', error);
    return res.status(500).json({ error: 'Erro ao atualizar as notificações.' });
  }
};
