const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

// ARMAZENAMENTO DE IMAGENS
//
// Duas formas de guardar, escolhidas pelo .env (sem mudar código):
//   STORAGE_DRIVER=local     (padrão) grava em src/uploads/<pasta>/  → só para desenvolvimento
//   STORAGE_DRIVER=supabase  grava no Supabase Storage (bucket público) → produção
//                            precisa de SUPABASE_URL, SUPABASE_SERVICE_KEY e SUPABASE_BUCKET
//
// Em qualquer driver, toda imagem é REDIMENSIONADA e convertida para WebP antes de ser guardada
// (uma foto de celular de 4 MB vira ~100 KB; um avatar vira ~15 KB). É isso que torna viável
// guardar milhares de fotos. O banco só guarda a URL final.

const PASTAS = {
  avatars: { largura: 256, altura: 256, ajuste: 'cover', qualidade: 80 }, // quadrado
  logos: { largura: 512, altura: 512, ajuste: 'inside', qualidade: 82 },
  eventos: { largura: 1600, altura: 900, ajuste: 'inside', qualidade: 80 },
  convidados: { largura: 900, altura: 900, ajuste: 'inside', qualidade: 80 },
  galeria: { largura: 1600, altura: 1600, ajuste: 'inside', qualidade: 78 }
};

const RAIZ_LOCAL = path.join(__dirname, '..', 'uploads');

const driver = () => (process.env.STORAGE_DRIVER || 'local').toLowerCase();

let clienteSupabase = null;
function supabase() {
  if (clienteSupabase) return clienteSupabase;
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !chave) throw new Error('STORAGE_DRIVER=supabase exige SUPABASE_URL e SUPABASE_SERVICE_KEY no .env.');
  clienteSupabase = createClient(url, chave, { auth: { persistSession: false } });
  return clienteSupabase;
}
const bucket = () => process.env.SUPABASE_BUCKET || 'uploads';

// Processa a imagem enviada e a guarda. Devolve { url, chave, tamanho }.
// `origemLocal` é a base pública das URLs locais (ex.: http://localhost:3333), usada só no driver local.
async function salvarImagem(buffer, pasta, { origemLocal = '' } = {}) {
  const perfil = PASTAS[pasta];
  if (!perfil) throw new Error(`Pasta de upload desconhecida: ${pasta}`);

  // .rotate() respeita a orientação EXIF (foto de celular deitada); a conversão descarta metadados (privacidade: GPS).
  const otimizada = await sharp(buffer, { failOn: 'error', limitInputPixels: 50_000_000 })
    .rotate()
    .resize({ width: perfil.largura, height: perfil.altura, fit: perfil.ajuste, withoutEnlargement: true })
    .webp({ quality: perfil.qualidade })
    .toBuffer();

  const nome = `${crypto.randomUUID()}.webp`;
  const chave = `${pasta}/${nome}`;

  if (driver() === 'supabase') {
    const { error } = await supabase().storage.from(bucket()).upload(chave, otimizada, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (error) throw new Error(`Falha ao enviar a imagem para o armazenamento: ${error.message}`);
    const { data } = supabase().storage.from(bucket()).getPublicUrl(chave);
    return { url: data.publicUrl, chave, tamanho: otimizada.length };
  }

  const pastaLocal = path.join(RAIZ_LOCAL, pasta);
  fs.mkdirSync(pastaLocal, { recursive: true });
  fs.writeFileSync(path.join(pastaLocal, nome), otimizada);
  return { url: `${origemLocal}/uploads/${chave}`, chave, tamanho: otimizada.length };
}

// Apaga a imagem referenciada por uma URL NOSSA (local ou do bucket). URLs de fora (imagem
// hospedada em outro site) e qualquer falha são ignoradas: foto órfã é melhor que requisição derrubada.
async function apagarImagem(url) {
  if (typeof url !== 'string' || !url) return;
  try {
    const { pathname } = new URL(url);

    const local = pathname.match(/^\/uploads\/([a-z]+)\/([^/.][^/]*)$/);
    if (local && PASTAS[local[1]]) {
      fs.unlink(path.join(RAIZ_LOCAL, local[1], local[2]), () => {});
      return;
    }

    if (driver() === 'supabase') {
      const marca = `/storage/v1/object/public/${bucket()}/`;
      const i = pathname.indexOf(marca);
      if (i >= 0) {
        const chave = decodeURIComponent(pathname.slice(i + marca.length));
        const pasta = chave.split('/')[0];
        if (PASTAS[pasta]) await supabase().storage.from(bucket()).remove([chave]);
      }
    }
  } catch {
    // URL inválida ou falha do armazenamento: nada a apagar.
  }
}

module.exports = { salvarImagem, apagarImagem, PASTAS };
