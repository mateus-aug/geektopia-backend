const multer = require('multer');
const path = require('path');
const fs = require('fs');

function criarUploadMiddleware(pasta) {
  const uploadDir = path.join(__dirname, '..', 'uploads', pasta);

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const extensao = path.extname(file.originalname);
      const nomeUnico = `${pasta}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extensao}`;
      cb(null, nomeUnico);
    }
  });

  const fileFilter = (req, file, cb) => {
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (tiposPermitidos.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de arquivo não suportado. Envie uma imagem JPEG, PNG ou WEBP.'));
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: 4 * 1024 * 1024 } // 4MB (fotos de evento tendem a ser maiores que avatar)
  });
}

module.exports = {
  avatar: criarUploadMiddleware('avatars'),
  eventos: criarUploadMiddleware('eventos'),
  convidados: criarUploadMiddleware('convidados'),
  galeria: criarUploadMiddleware('galeria'),
  logos: criarUploadMiddleware('logos')
};