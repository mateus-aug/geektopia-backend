const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const limites = require('./middlewares/limites');
const routes = require('./routes');
const path = require('path');

const app = express();

// Atrás de proxy (Render, Railway, ngrok...) o IP real vem no cabeçalho: sem isso o limite de uso enxerga o proxy.
app.set('trust proxy', 1);

// Cabeçalhos de segurança. As imagens são servidas para o front (outro endereço), então liberamos o uso entre origens.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS: só o front do projeto pode chamar a API pelo navegador (URL_FRONTEND, aceita vários separados por vírgula).
// Chamadas sem Origin (servidor do Mercado Pago, curl, testes) não são de navegador e passam normalmente.
const origensPermitidas = () => {
  const lista = String(process.env.URL_FRONTEND || '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  if (process.env.NODE_ENV !== 'production') lista.push('http://localhost:5173', 'http://127.0.0.1:5173');
  return lista;
};
app.use(cors({
  origin: (origem, cb) => (!origem || origensPermitidas().includes(origem) ? cb(null, true) : cb(null, false)),
  credentials: false
}));

app.use(express.json({ limit: '200kb' }));
app.use('/api', (req, res, next) => (req.path === '/pedidos/webhook' ? next() : limites.geral(req, res, next)));

// Todas as rotas ficarão sob /api
app.use('/api', routes);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  return res.json({ message: 'API GEEKTOPIA / NEXUS rodando com sucesso!' });
});

// Rota que não existe: JSON em vez da página "Cannot GET" do Express.
app.use((req, res) => {
  return res.status(404).json({ error: `Rota ${req.method} ${req.originalUrl} não encontrada.` });
});

// Erros que escaparam dos controllers. O express.json() manda para cá o
// corpo malformado (status 400) e o corpo grande demais (413); qualquer
// outra coisa é bug e vira 500 sem vazar detalhes internos.
// Os 4 parâmetros são obrigatórios: é assim que o Express reconhece um
// handler de erro.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Corpo da requisição não é um JSON válido.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Corpo da requisição grande demais.' });
  }
  // Upload recusado pelo multer: erro do usuário (arquivo grande demais ou
  // formato inválido), não do servidor.
  if (err.name === 'MulterError') {
    const mensagem = err.code === 'LIMIT_FILE_SIZE'
      ? 'A imagem é grande demais. O limite é de 15MB.'
      : 'Não foi possível processar o arquivo enviado.';
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: mensagem });
  }
  if (typeof err.message === 'string' && err.message.startsWith('Formato de arquivo não suportado')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Erro não tratado:', err);
  return res.status(500).json({ error: 'Erro interno do servidor.' });
});

module.exports = app;
