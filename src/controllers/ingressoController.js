const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');

// Ingressos do participante e check-in na portaria.
//
// Casos de uso atendidos (PDF, seção 4.5.2.1):
//   l) Consultar Ingressos Adquiridos
//   y) Validar Ingresso (check-in pelo QR code)
//
// O ingresso NÃO é criado aqui: ele nasce no pedidoController quando o
// Mercado Pago confirma o pagamento. O dono vem SEMPRE de req.userId;
// quem não é dono nem admin recebe 404, para não revelar que o ingresso
// existe. A imagem do QR é desenhada pelo front a partir de `codigo_qr`.

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

// PATCH /api/ingressos/checkin — admin. Corpo: { codigo_qr }.
// Chamado pela portaria depois de ler o QR com a câmera.
exports.checkin = async (req, res) => {
  try {
    const codigo = lerTexto(req.body.codigo_qr, 255);
    if (!codigo) {
      return res.status(400).json({ error: 'O campo "codigo_qr" é obrigatório.' });
    }

    // Condição e gravação num único UPDATE: se duas portarias lerem o mesmo
    // QR ao mesmo tempo, só uma consegue virar Valido -> Utilizado.
    const resultado = await prisma.ingresso.updateMany({
      where: { codigo_qr: codigo, status_ingresso: 'Valido' },
      data: { status_ingresso: 'Utilizado', data_checkin: new Date() }
    });

    const ingresso = await prisma.ingresso.findUnique({
      where: { codigo_qr: codigo },
      include: INCLUIR
    });

    // O UPDATE não pegou nada: ou o código não existe, ou já saiu de Valido.
    if (resultado.count === 0) {
      if (!ingresso) {
        return res.status(404).json({ error: 'Ingresso não encontrado.' });
      }
      if (ingresso.status_ingresso === 'Utilizado') {
        return res.status(409).json({
          error: 'Ingresso já utilizado.',
          data_checkin: ingresso.data_checkin,
          ingresso: montarResposta(ingresso)
        });
      }
      return res.status(409).json({ error: 'Ingresso cancelado.', ingresso: montarResposta(ingresso) });
    }

    return res.json({ mensagem: 'Entrada liberada.', ingresso: montarResposta(ingresso) });
  } catch (error) {
    console.error('Erro no check-in do ingresso:', error);
    return res.status(500).json({ error: 'Erro ao validar o ingresso.' });
  }
};
