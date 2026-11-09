// ENTRADA RUIM NUNCA VIRA ERRO 500.
//
// Uma varredura chamou as 145 rotas com ids absurdos, corpo ausente e contas
// apagadas, e encontrou ~90 rotas devolvendo 500 ("erro interno") para o que é
// erro de quem chamou. Estes testes travam as quatro causas raiz:
//   1. id maior do que cabe numa coluna int do PostgreSQL;
//   2. requisição sem corpo JSON (no Express 5, req.body fica undefined);
//   3. edição de perfil sem validação nenhuma;
//   4. token de uma conta que já foi apagada.
// E a falha de segurança do avatar: usuário comum apagando imagem alheia.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { R, prisma, jwt, iniciarServidor, criarUsuario, limparZZ } = require('./helpers/ambiente');

let servidor;
test.before(async () => { await limparZZ(); servidor = await iniciarServidor(); });
test.after(async () => { await limparZZ(); await servidor.fechar(); await prisma.$disconnect(); });

const H = { 'Content-Type': 'application/json' };

test('id grande demais para o banco responde 400/404, não 500', async () => {
  const { H: logado } = await criarUsuario('ent.idgrande');
  const gigante = '99999999999';
  for (const rota of [`/lotes/${gigante}`, `/geektopia/${gigante}`, `/programacao/${gigante}`,
    `/competicoes/${gigante}`, `/pedidos/${gigante}`, `/inscricoes/${gigante}`, `/ingressos/${gigante}`]) {
    const r = await servidor.call('GET', rota, logado);
    assert.ok([400, 404].includes(r.s), `${rota} -> ${r.s}`);
  }
});

test('requisição sem corpo responde 400, não 500', async () => {
  const { H: logado } = await criarUsuario('ent.semcorpo');
  const semCorpo = { Authorization: logado.Authorization }; // sem Content-Type, sem body
  for (const [metodo, rota] of [['POST', '/pedidos'], ['POST', '/inscricoes'], ['POST', '/parceiros/competidor'],
    ['PUT', '/parceiros/expositor'], ['PATCH', '/auth/change-password']]) {
    const r = await servidor.call(metodo, rota, semCorpo);
    assert.ok(r.s >= 400 && r.s < 500, `${metodo} ${rota} -> ${r.s}`);
  }
  assert.equal((await servidor.call('POST', '/auth/login', {})).s, 400, 'login sem corpo');
  assert.equal((await servidor.call('POST', '/auth/login', H, {})).s, 400, 'login sem e-mail e senha');
  assert.equal((await servidor.call('POST', '/auth/login', H, { email: ['x'], senha: 1 })).s, 400, 'tipos errados');
});

test('editar o perfil passa pelas mesmas regras do cadastro', async () => {
  const { u, H: logado } = await criarUsuario('ent.perfil', { nome_completo: 'ZZ Nome Original', estado: 'PR' });
  for (const [nome, corpo] of [
    ['nome vazio', { nome_completo: '' }],
    ['nome só espaços', { nome_completo: '    ' }],
    ['nome null', { nome_completo: null }],
    ['nome longo demais', { nome_completo: 'A'.repeat(151) }],
    ['UF inexistente', { estado: 'XX' }],
    ['UF com 3 letras', { estado: 'PRR' }],
    ['nickname longo demais', { nickname: 'n'.repeat(31) }]
  ]) {
    const r = await servidor.call('PUT', '/auth/profile', logado, corpo);
    assert.equal(r.s, 400, `${nome} -> ${r.s}`);
  }
  const salvo = await prisma.usuario.findUnique({ where: { id_usuario: u.id_usuario } });
  assert.equal(salvo.nome_completo, 'ZZ Nome Original', 'nada inválido foi gravado');
  assert.equal(salvo.estado, 'PR');

  // O que é válido continua funcionando, já normalizado.
  const ok = await servidor.call('PUT', '/auth/profile', logado, { nome_completo: '  ZZ   Nome  Novo ', estado: 'sp' });
  assert.equal(ok.s, 200, JSON.stringify(ok.b));
  assert.equal(ok.b.user.nome_completo, 'ZZ Nome Novo');
  assert.equal(ok.b.user.estado, 'SP');
});

test('nickname de perfil repetido responde 409, não 500', async () => {
  const { H: a } = await criarUsuario('ent.nick.a');
  const { H: b } = await criarUsuario('ent.nick.b');
  const nick = `zz${Date.now() % 1e8}`;
  assert.equal((await servidor.call('PUT', '/auth/profile', a, { nickname: nick })).s, 200);
  const r = await servidor.call('PUT', '/auth/profile', b, { nickname: nick });
  assert.equal(r.s, 409);
  assert.equal(r.b.campo, 'nickname');
});

test('conta apagada com token ainda válido: 404, não 500', async () => {
  const fantasma = {
    ...H,
    Authorization: `Bearer ${jwt.sign({ id: 2147480000, isAdmin: false }, process.env.JWT_SECRET, { expiresIn: '1h' })}`
  };
  assert.equal((await servidor.call('PUT', '/auth/profile', fantasma, { nome_completo: 'ZZ Ninguém' })).s, 404);
  assert.equal((await servidor.call('DELETE', '/auth/delete-account', fantasma)).s, 404);
});

test('usuário comum NÃO consegue apagar imagem de outra pessoa pelo avatar', async () => {
  // Isca: finge ser o banner de uma edição. Nenhum arquivo real é tocado.
  const pasta = path.join(R, 'src', 'uploads', 'eventos');
  fs.mkdirSync(pasta, { recursive: true });
  const isca = path.join(pasta, `zz-isca-${Date.now()}.webp`);
  fs.writeFileSync(isca, 'isca');
  const urlIsca = `http://localhost:3333/uploads/eventos/${path.basename(isca)}`;

  const { u, H: logado } = await criarUsuario('ent.avatar');
  let avatarNovo = null;
  try {
    // 1. tenta gravar a imagem alheia como "seu" avatar
    await servidor.call('PUT', '/auth/profile', logado, { avatar_url: urlIsca });
    const perfil = await prisma.perfil.findUnique({ where: { id_usuario: u.id_usuario } });
    assert.notEqual(perfil?.avatar_url, urlIsca, 'avatar_url vindo do corpo é ignorado');

    // 2. mesmo que um registro antigo aponte para fora da pasta de avatares...
    await prisma.perfil.upsert({
      where: { id_usuario: u.id_usuario },
      create: { id_usuario: u.id_usuario, avatar_url: urlIsca },
      update: { avatar_url: urlIsca }
    });

    // 3. ...enviar um avatar novo não apaga o arquivo alheio.
    const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#F7C531' } }).png().toBuffer();
    const f = new FormData();
    f.append('avatar', new Blob([png], { type: 'image/png' }), 'a.png');
    const up = await fetch(`${servidor.base}/auth/upload-avatar`, { method: 'POST', headers: { Authorization: logado.Authorization }, body: f });
    assert.equal(up.status, 200);
    avatarNovo = (await up.json()).avatar_url;

    await new Promise((r) => setTimeout(r, 300)); // o unlink é assíncrono
    assert.ok(fs.existsSync(isca), 'a imagem alheia continua lá');
  } finally {
    if (fs.existsSync(isca)) fs.unlinkSync(isca);
    const m = avatarNovo && avatarNovo.match(/uploads\/avatars\/([^/]+)$/);
    if (m) fs.rmSync(path.join(R, 'src', 'uploads', 'avatars', m[1]), { force: true });
  }
});
