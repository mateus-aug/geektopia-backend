// UPLOAD DE IMAGENS: compressão, validação pelo conteúdo, limite de tamanho e troca de foto.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { R, prisma, iniciarServidor, criarUsuario, limparZZ } = require('./helpers/ambiente');

let servidor;
const criados = []; // arquivos gravados pelos testes: apagados no fim
test.before(async () => { await limparZZ(); servidor = await iniciarServidor(); });
test.after(async () => {
  criados.forEach((f) => { try { fs.unlinkSync(f); } catch { /* já apagado */ } });
  await limparZZ(); await servidor.fechar(); await prisma.$disconnect();
});

// Foto grande e "barulhenta" (parecida com uma foto de celular).
const fotoGrande = () => sharp({ create: { width: 2400, height: 1600, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 25 } } }).jpeg({ quality: 70 }).toBuffer();

const enviar = async (H, campo, buffer, tipo = 'image/jpeg', nome = 'foto.jpg') => {
  const f = new FormData();
  f.append(campo, new Blob([buffer], { type: tipo }), nome);
  const r = await fetch(`${servidor.base}/auth/upload-avatar`, { method: 'POST', headers: { Authorization: H.Authorization }, body: f });
  const b = await r.json().catch(() => null);
  if (b && b.avatar_url) criados.push(path.join(R, 'src', 'uploads', 'avatars', path.basename(new URL(b.avatar_url).pathname)));
  return { s: r.status, b };
};
const arquivoLocal = (url) => path.join(R, 'src', 'uploads', 'avatars', path.basename(new URL(url).pathname));

test('foto enorme vira um avatar pequeno em WebP', async () => {
  const { H } = await criarUsuario('up1');
  const original = await fotoGrande();
  assert.ok(original.length > 500_000 && original.length < 4_000_000, `a foto de teste tem ${original.length} bytes`);

  const r = await enviar(H, 'avatar', original);
  assert.equal(r.s, 200);
  assert.match(r.b.avatar_url, /\/uploads\/avatars\/[0-9a-f-]+\.webp$/);
  const arq = arquivoLocal(r.b.avatar_url);
  const meta = await sharp(arq).metadata();
  assert.equal(meta.format, 'webp');
  assert.ok(meta.width <= 256 && meta.height <= 256, `avatar em ${meta.width}x${meta.height}`);
  assert.ok(fs.statSync(arq).size < 60_000, `avatar com ${fs.statSync(arq).size} bytes`);
});

test('trocar a foto apaga a anterior do armazenamento', async () => {
  const { H } = await criarUsuario('up2');
  const a = await enviar(H, 'avatar', await fotoGrande());
  const antiga = arquivoLocal(a.b.avatar_url);
  assert.ok(fs.existsSync(antiga));
  const b = await enviar(H, 'avatar', await fotoGrande());
  assert.equal(b.s, 200);
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!fs.existsSync(antiga), 'a foto antiga foi removida');
  assert.ok(fs.existsSync(arquivoLocal(b.b.avatar_url)));
});

test('arquivo que não é imagem é recusado, mesmo dizendo ser PNG', async () => {
  const { H } = await criarUsuario('up3');
  const falso = await enviar(H, 'avatar', Buffer.from('<?php echo 1; ?> isto não é imagem nenhuma, só texto disfarçado'), 'image/png', 'x.png');
  assert.equal(falso.s, 400);
  const svg = await enviar(H, 'avatar', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml', 'x.svg');
  assert.equal(svg.s, 400, 'SVG (pode carregar script) não é aceito');
  const semLogin = await fetch(`${servidor.base}/auth/upload-avatar`, { method: 'POST', body: new FormData() });
  assert.equal(semLogin.status, 401, 'sem login não sobe arquivo');
});

test('arquivo acima de 15 MB é recusado', async () => {
  const { H } = await criarUsuario('up4');
  const grande = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16 * 1024 * 1024, 1)]);
  const r = await enviar(H, 'avatar', grande);
  assert.equal(r.s, 413);
});
