const fs = require('fs');
const path = require('path');

// Pastas de upload que este utilitário tem permissão de apagar. A lista
// fechada impede que uma URL adulterada no banco aponte para outro lugar.
const PASTAS_PERMITIDAS = ['eventos', 'convidados', 'galeria', 'logos'];

const RAIZ_UPLOADS = path.join(__dirname, '..', 'uploads');

// Monta a URL pública de um arquivo que o multer acabou de salvar.
function urlDoUpload(req, pasta, arquivo) {
  return `${req.protocol}://${req.get('host')}/uploads/${pasta}/${arquivo.filename}`;
}

// Apaga do disco o arquivo referenciado por uma URL de upload nossa.
// Ignora em silêncio qualquer URL que não seja de uma pasta permitida (ex.:
// imagem hospedada fora) e qualquer falha de disco: uma foto órfã é melhor
// do que derrubar a requisição por causa dela.
function apagarArquivoLocal(url) {
  if (typeof url !== 'string' || url.length === 0) return;

  try {
    const { pathname } = new URL(url);
    const partes = pathname.match(/^\/uploads\/([a-z]+)\/([^/.][^/]*)$/);
    if (!partes || !PASTAS_PERMITIDAS.includes(partes[1])) return;

    fs.unlink(path.join(RAIZ_UPLOADS, partes[1], partes[2]), () => {});
  } catch {
    // URL inválida: nada a apagar.
  }
}

// Quando a validação recusa a requisição depois de o multer já ter gravado o
// arquivo, este atalho evita deixar a imagem solta no disco.
function descartarUpload(req) {
  if (req.file && req.file.path) {
    fs.unlink(req.file.path, () => {});
  }
}

module.exports = { urlDoUpload, apagarArquivoLocal, descartarUpload };
