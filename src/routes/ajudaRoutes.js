const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const ajudaController = require('../controllers/ajudaController');

// Leitor de token OPCIONAL.
//
// A ajuda é pública: ninguém precisa estar logado para ler. Mas quem está
// logado como administrador recebe também os artigos de operação do painel.
//
// Por isso não dá para usar o authMiddleware aqui: ele devolve 401 quando não
// há token. Este middleware lê o token SE existir e, em qualquer outro caso,
// segue em frente sem bloquear — o controller trata req.userIsAdmin
// indefinido como "visitante".
function lerSessaoSeHouver(req, _res, next) {
  const cabecalho = req.headers.authorization;

  if (cabecalho) {
    const [, token] = cabecalho.split(' ');
    try {
      const dados = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = dados.id;
      req.userIsAdmin = dados.isAdmin;
    } catch (_erro) {
      // Token inválido ou expirado não é erro aqui: a pessoa só vê a ajuda
      // pública, como qualquer visitante.
    }
  }

  return next();
}

router.use(lerSessaoSeHouver);

// Índice completo: categorias, artigos e destaques. Monta a tela de uma vez.
router.get('/', ajudaController.indice);

// Busca. Declarada antes de '/artigos/:id' por ser caminho fixo.
router.get('/busca', ajudaController.buscar);

router.get('/artigos', ajudaController.listar);
router.get('/artigos/:id', ajudaController.buscarPorId);

module.exports = router;
