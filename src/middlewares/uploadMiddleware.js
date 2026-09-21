const multer = require('multer');
const { salvarImagem } = require('../services/armazenamento');

// Upload de imagem em duas etapas:
//   1) multer recebe o arquivo NA MEMÓRIA (valida tipo e tamanho; nada vai para o disco ainda);
//   2) `processar` redimensiona/comprime e guarda (disco local ou Supabase, conforme STORAGE_DRIVER).
// Depois disso o controller enxerga:  req.file.url  (endereço final)  e  req.file.chave.
// Os controllers já chamam `descartarUpload(req)` quando recusam a requisição depois do upload.

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];
const LIMITE = 4 * 1024 * 1024; // 4MB de entrada; o que fica guardado é bem menor (WebP redimensionado)

// Confere pelo CONTEÚDO (bytes iniciais), não só pelo tipo que o navegador declarou.
function pareceImagem(b) {
  if (!b || b.length < 12) return false;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
  return jpeg || png || webp;
}

function criarUploadMiddleware(pasta) {
  const receber = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => (TIPOS.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Formato de arquivo não suportado. Envie uma imagem JPEG, PNG ou WEBP.'))),
    limits: { fileSize: LIMITE, files: 1 }
  });

  const processar = async (req, res, next) => {
    if (!req.file) return next();
    try {
      if (!pareceImagem(req.file.buffer)) {
        return next(new Error('Formato de arquivo não suportado. Envie uma imagem JPEG, PNG ou WEBP.'));
      }
      const salvo = await salvarImagem(req.file.buffer, pasta, { origemLocal: `${req.protocol}://${req.get('host')}` });
      req.file.url = salvo.url;
      req.file.chave = salvo.chave;
      req.file.buffer = undefined; // libera a memória
      return next();
    } catch (erro) {
      console.error('Erro ao processar a imagem enviada:', erro.message);
      return next(new Error('Formato de arquivo não suportado. A imagem parece corrompida.'));
    }
  };

  return { single: (campo) => [receber.single(campo), processar] };
}

module.exports = {
  avatar: criarUploadMiddleware('avatars'),
  eventos: criarUploadMiddleware('eventos'),
  convidados: criarUploadMiddleware('convidados'),
  galeria: criarUploadMiddleware('galeria'),
  logos: criarUploadMiddleware('logos')
};
