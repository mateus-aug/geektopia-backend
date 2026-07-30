const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Token de acesso não fornecido.' });
  }

  // O token vem no formato "Bearer <TOKEN>", por isso dividimos no espaço
  const [, token] = authHeader.split(' ');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Anexa as informações do usuário logado na requisição
    req.userId = decoded.id;
    req.userIsAdmin = decoded.isAdmin;

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
};