const { apagarImagem } = require('../services/armazenamento');

// Ajudantes de upload usados pelos controllers. O armazenamento em si
// (local ou Supabase, compressão em WebP) vive em services/armazenamento.js.

// Endereço público do arquivo que o middleware acabou de guardar.
function urlDoUpload(req, pasta, arquivo) {
  return arquivo.url;
}

// Apaga a imagem antiga (URL nossa). Ignora URLs de fora e falhas.
function apagarArquivoLocal(url) {
  apagarImagem(url);
}

// Quando a validação recusa a requisição depois de o upload já ter sido guardado,
// este atalho evita deixar a imagem solta.
function descartarUpload(req) {
  if (req.file && req.file.url) apagarImagem(req.file.url);
}

module.exports = { urlDoUpload, apagarArquivoLocal, descartarUpload };
