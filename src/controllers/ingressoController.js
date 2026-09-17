const prisma = require('../config/prisma');
const { lerId } = require('../utils/validadores');

// Ingressos do participante.
//
// Casos de uso atendidos (PDF, seção 4.5.2.1):
//   l) Consultar Ingressos Adquiridos
//
// O ingresso NÃO é criado aqui: ele nasce no pedidoController quando o
// Mercado Pago confirma o pagamento. Este controller só lê. O dono vem
// SEMPRE de req.userId; quem não é dono nem admin recebe 404, para não
// revelar que o ingresso existe.

// Valores aceitos pelo enum StatusIngressoEnum do schema.prisma.
const STATUS_VALIDOS = ['Valido', 'Utilizado', 'Cancelado'];

// Dados trazidos junto em toda consulta: o que a tela do ingresso mostra.
const INCLUIR = {
  lote: { select: { id_lote: true, nome_lote: true, valor_ingresso: true } },
  geektopia: {
    select: {
      id_geektopia: true,
      nome_edicao: true,
      data_inicio: true,
      data_fim: true,
      local: true,
      status_evento: true
    }
  },
  usuario: { select: { nome_completo: true } }
};

// Monta a resposta: converte o Decimal do lote e resolve o titular.
// `nome_titular` fica nulo quando o comprador é o próprio portador;
// nesse caso a tela mostra o nome do usuário.
function montarResposta(i) {
  const { usuario, ...campos } = i;
  return {
    ...campos,
    nome_titular: i.nome_titular || usuario.nome_completo,
    lote: {
      ...i.lote,
      valor_ingresso: i.lote.valor_ingresso === null ? null : Number(i.lote.valor_ingresso)
    }
  };
}

// GET /api/ingressos/meus?id_geektopia=&status=
exports.listarMeus = async (req, res) => {
  try {
    const filtro = { id_usuario: req.userId };

    if (req.query.id_geektopia !== undefined) {
      const idGeektopia = lerId(req.query.id_geektopia);
      if (!idGeektopia) {
        return res.status(400).json({ error: 'O filtro "id_geektopia" deve ser um inteiro positivo.' });
      }
      filtro.id_geektopia = idGeektopia;
    }

    if (req.query.status !== undefined) {
      if (!STATUS_VALIDOS.includes(req.query.status)) {
        return res.status(400).json({ error: `O filtro "status" deve ser um de: ${STATUS_VALIDOS.join(', ')}.` });
      }
      filtro.status_ingresso = req.query.status;
    }

    const ingressos = await prisma.ingresso.findMany({
      where: filtro,
      include: INCLUIR,
      orderBy: { id_ingresso: 'desc' }
    });

    return res.json(ingressos.map(montarResposta));
  } catch (error) {
    console.error('Erro ao listar ingressos do usuário:', error);
    return res.status(500).json({ error: 'Erro ao listar seus ingressos.' });
  }
};

// GET /api/ingressos/:id — dono ou admin.
exports.buscarPorId = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'O id do ingresso deve ser um inteiro positivo.' });
    }

    const ingresso = await prisma.ingresso.findUnique({
      where: { id_ingresso: id },
      include: INCLUIR
    });

    // Mesma resposta para "não existe" e "não é seu".
    if (!ingresso || (ingresso.id_usuario !== req.userId && !req.userIsAdmin)) {
      return res.status(404).json({ error: 'Ingresso não encontrado.' });
    }

    return res.json(montarResposta(ingresso));
  } catch (error) {
    console.error('Erro ao buscar ingresso:', error);
    return res.status(500).json({ error: 'Erro ao buscar o ingresso.' });
  }
};
