module.exports = (req, res, next) => {
  // O authMiddleware já colocou req.userIsAdmin na requisição
  if (!req.userIsAdmin) {
    return res.status(403).json({ error: 'Acesso negado. Requer privilégios de administrador.' });
  }

  return next();
};