const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

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
      ? 'A imagem é grande demais. O limite é de 4MB.'
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
