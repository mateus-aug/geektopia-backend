const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token de acesso não fornecido.' });
  }

  // O token vem no formato "Bearer <TOKEN>", por isso dividimos no espaço
  const [, token] = authHeader.split(' ');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }

  // Anexa as informações do usuário logado na requisição
  req.userId = decoded.id;
  req.userIsAdmin = false;

  // O "isAdmin" do token é só uma pista, não uma prova. O token vale 7 dias:
  // sem esta conferência, um administrador REBAIXADO (demoteAdmin) ou marcado
  // como Inativo seguia com poder total até o token vencer — inclusive para ver
  // ingressos e pedidos de outras pessoas. Aqui a palavra final é do banco.
  //
  // Só consulta quando o token diz que é admin: para o público comum (a imensa
  // maioria das requisições) o custo continua zero. Quem é promovido precisa
  // entrar de novo para o token novo trazer a permissão — o lado seguro.
  if (decoded.isAdmin === true) {
    try {
      const admin = await prisma.administrador.findUnique({
        where: { id_usuario: decoded.id },
        select: { status_conta: true }
      });
      req.userIsAdmin = admin?.status_conta === 'Ativo';
    } catch (erro) {
      console.error('Erro ao conferir administrador:', erro);
      return res.status(503).json({ error: 'Não foi possível confirmar a sua sessão agora. Tente de novo em instantes.' });
    }
  }

  return next();
};
