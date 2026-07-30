const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json());

// Todas as rotas ficarão sob /api
app.use('/api', routes);

app.get('/', (req, res) => {
  return res.json({ message: 'API GEEKTOPIA / NEXUS rodando com sucesso!' });
});

module.exports = app;