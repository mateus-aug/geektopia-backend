// Migra as imagens que estão na pasta do projeto (src/uploads) para o armazenamento configurado
// (Supabase Storage), comprimindo em WebP, e troca as URLs no banco.
//
//   node scripts/migrar-uploads.js --simular     só mostra o que faria
//   node scripts/migrar-uploads.js               faz de verdade (exige STORAGE_DRIVER=supabase no .env)
//
// Seguro para rodar de novo: só mexe em URLs que ainda apontam para /uploads/ local.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/prisma');
const { salvarImagem } = require('../src/services/armazenamento');

const simular = process.argv.includes('--simular');
if (!simular && (process.env.STORAGE_DRIVER || 'local') !== 'supabase') {
  console.error('Defina STORAGE_DRIVER=supabase (e as chaves) no .env, ou use --simular.');
  process.exit(1);
}

// tabela.campo (delegate do Prisma, campo com a URL, pasta de destino)
const ALVOS = [
  ['perfil', 'avatar_url', 'avatars'],
  ['expositor', 'url_logo', 'logos'],
  ['geektopia', 'banner_url', 'eventos'],
  ['convidado', 'foto_url', 'convidados'],
  ['foto_Edicao', 'url_foto', 'galeria'],
  ['galeria_Edicoes_Passadas', 'url_foto', 'galeria']
];

(async () => {
  let movidas = 0; let faltando = 0; let bytesAntes = 0; let bytesDepois = 0;
  for (const [modelo, campo, pasta] of ALVOS) {
    const linhas = await prisma[modelo].findMany({ where: { [campo]: { contains: '/uploads/' } } });
    for (const linha of linhas) {
      const url = linha[campo];
      const m = String(url).match(/\/uploads\/([a-z]+)\/([^/]+)$/);
      if (!m) continue;
      const arquivo = path.join(__dirname, '..', 'src', 'uploads', m[1], m[2]);
      if (!fs.existsSync(arquivo)) { faltando += 1; console.warn(`  arquivo não encontrado (URL mantida): ${arquivo}`); continue; }

      const buffer = fs.readFileSync(arquivo);
      bytesAntes += buffer.length;
      if (simular) { console.log(`  [simulação] ${modelo}.${campo}: ${m[1]}/${m[2]} (${(buffer.length / 1024).toFixed(0)} KB)`); movidas += 1; continue; }

      const salvo = await salvarImagem(buffer, pasta);
      bytesDepois += salvo.tamanho;
      const chavePrimaria = Object.keys(linha)[0];
      await prisma[modelo].update({ where: { [chavePrimaria]: linha[chavePrimaria] }, data: { [campo]: salvo.url } });
      movidas += 1;
      console.log(`  ok ${modelo}.${campo}: ${(buffer.length / 1024).toFixed(0)} KB -> ${(salvo.tamanho / 1024).toFixed(0)} KB`);
    }
  }
  console.log(`\n${simular ? 'Seriam migradas' : 'Migradas'}: ${movidas} imagem(ns). Faltando no disco: ${faltando}.`);
  if (!simular && movidas) console.log(`Tamanho: ${(bytesAntes / 1048576).toFixed(1)} MB -> ${(bytesDepois / 1048576).toFixed(1)} MB.`);
  await prisma.$disconnect();
})();
