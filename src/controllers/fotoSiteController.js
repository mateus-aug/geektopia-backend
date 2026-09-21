const prisma = require('../config/prisma');
const { lerId, lerTexto } = require('../utils/validadores');
const { urlDoUpload, apagarArquivoLocal, descartarUpload } = require('../utils/arquivos');

// FOTOS DAS PÁGINAS INFORMATIVAS (carrossel da página Geektopia): pertencem ao site, não a uma edição.
// Criar um novo evento não mexe nelas.

const AREA = 'geektopia';
const MAX_FOTOS = 12;

// Só apaga o arquivo se nenhuma outra foto (do site ou de uma edição) ainda usa o mesmo endereço.
async function apagarSeSemUso(url, ignorarId) {
  const [site, edicao] = await Promise.all([
    prisma.foto_Site.count({ where: { url_foto: url, id_foto: { not: ignorarId } } }),
    prisma.foto_Edicao.count({ where: { url_foto: url } })
  ]);
  if (site === 0 && edicao === 0) apagarArquivoLocal(url);
}
exports.apagarSeSemUso = apagarSeSemUso;

// GET /api/fotos-site — público
exports.listar = async (req, res) => {
  try {
    return res.json(await prisma.foto_Site.findMany({ where: { area: AREA }, orderBy: [{ ordem: 'asc' }, { id_foto: 'asc' }] }));
  } catch (e) {
    console.error('Erro ao listar fotos do site:', e);
    return res.status(500).json({ error: 'Erro ao listar as fotos.' });
  }
};

// POST /api/fotos-site (multipart: foto, legenda?)
exports.criar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie a imagem no campo "foto".' });
    const legenda = req.body.legenda ? lerTexto(req.body.legenda, 200) : null;
    if (req.body.legenda && !legenda) { descartarUpload(req); return res.status(400).json({ error: 'A legenda deve ter até 200 caracteres.' }); }

    const total = await prisma.foto_Site.count({ where: { area: AREA } });
    if (total >= MAX_FOTOS) { descartarUpload(req); return res.status(409).json({ error: `Limite de ${MAX_FOTOS} fotos atingido.` }); }

    const ultima = await prisma.foto_Site.aggregate({ where: { area: AREA }, _max: { ordem: true } });
    const foto = await prisma.foto_Site.create({ data: { area: AREA, url_foto: urlDoUpload(req, 'galeria', req.file), legenda, ordem: (ultima._max.ordem ?? -1) + 1 } });
    return res.status(201).json({ message: 'Foto adicionada!', foto });
  } catch (e) {
    descartarUpload(req);
    console.error('Erro ao adicionar foto do site:', e);
    return res.status(500).json({ error: 'Erro ao adicionar a foto.' });
  }
};

// PUT /api/fotos-site/:id — só a legenda (para trocar a imagem, remova e adicione outra)
exports.atualizar = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador da foto é inválido.' });
    const bruta = req.body.legenda;
    const legenda = bruta === null || bruta === '' ? null : lerTexto(bruta, 200);
    if (bruta && !legenda) return res.status(400).json({ error: 'A legenda deve ter até 200 caracteres.' });
    const existe = await prisma.foto_Site.findUnique({ where: { id_foto: id } });
    if (!existe) return res.status(404).json({ error: 'Foto não encontrada.' });
    return res.json({ message: 'Foto atualizada!', foto: await prisma.foto_Site.update({ where: { id_foto: id }, data: { legenda } }) });
  } catch (e) {
    console.error('Erro ao atualizar foto do site:', e);
    return res.status(500).json({ error: 'Erro ao atualizar a foto.' });
  }
};

// DELETE /api/fotos-site/:id
exports.remover = async (req, res) => {
  try {
    const id = lerId(req.params.id);
    if (!id) return res.status(400).json({ error: 'O identificador da foto é inválido.' });
    const atual = await prisma.foto_Site.findUnique({ where: { id_foto: id } });
    if (!atual) return res.status(404).json({ error: 'Foto não encontrada.' });
    await prisma.foto_Site.delete({ where: { id_foto: id } });
    await apagarSeSemUso(atual.url_foto, id);
    return res.json({ message: 'Foto removida!' });
  } catch (e) {
    console.error('Erro ao remover foto do site:', e);
    return res.status(500).json({ error: 'Erro ao remover a foto.' });
  }
};

// PATCH /api/fotos-site/reordenar  { ids: [..] } na nova ordem
exports.reordenar = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : null;
    if (!ids || ids.length === 0 || ids.some((i) => !Number.isInteger(i) || i <= 0) || new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: 'Envie a lista de ids das fotos, sem repetir.' });
    }
    const existentes = await prisma.foto_Site.count({ where: { area: AREA, id_foto: { in: ids } } });
    if (existentes !== ids.length) return res.status(400).json({ error: 'Alguma foto da lista não existe.' });
    await prisma.$transaction(ids.map((id, ordem) => prisma.foto_Site.update({ where: { id_foto: id }, data: { ordem } })));
    return res.json({ message: 'Ordem atualizada!' });
  } catch (e) {
    console.error('Erro ao reordenar fotos do site:', e);
    return res.status(500).json({ error: 'Erro ao reordenar.' });
  }
};
