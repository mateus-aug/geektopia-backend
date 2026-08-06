const prisma = require('../src/config/prisma'); // usa o mesmo client compartilhado do authController
const bcrypt = require('bcryptjs');

async function limparDadosAntigos() {
  console.log('Limpando dados de teste de execuções anteriores...');

  // Ordem importa: primeiro quem depende (FK), depois quem é dependido.
  await prisma.ingresso.deleteMany({ where: { codigo_qr: 'QR-TESTE-0001' } });
  await prisma.lote.deleteMany({ where: { nome_lote: 'Ingresso Sábado - 1º Lote' } });
  await prisma.administrador.deleteMany({ where: { usuario: { email: 'teste@nexus.com' } } });
  await prisma.usuario.deleteMany({ where: { email: 'teste@nexus.com' } });
  await prisma.espaco.deleteMany({ where: { tipo_espaco: 'Barraca 3x3' } });
  await prisma.geektopia.deleteMany({ where: { nome_edicao: 'GEEKTOPIA 2026' } });

  console.log('✔ Limpeza concluída.\n');
}

async function main() {
  await limparDadosAntigos();

  console.log('Iniciando o seed...');

  // 1. Criar uma edição do GEEKTOPIA
  const geektopia = await prisma.geektopia.create({
    data: {
      nome_edicao: 'GEEKTOPIA 2026',
      data_inicio: new Date('2026-11-14'),
      data_fim: new Date('2026-11-15'),
      local: 'Centro de Eventos de Ponta Grossa',
      descricao: 'Edição de teste criada pelo seed.',
      status_evento: 'Bloqueado',
      qnt_dias: 2,
    },
  });
  console.log('✔ Geektopia criada:', geektopia.id_geektopia);

  // 2. Criar um usuário comum
  const senhaHash = await bcrypt.hash('senha123', 10);
  const usuario = await prisma.usuario.create({
    data: {
      nome_completo: 'Usuário de Teste',
      cpf: '12345678900',
      email: 'teste@nexus.com',
      senha: senhaHash,
      data_nascimento: new Date('2000-01-01'),
      cidade: 'Ponta Grossa',
    },
  });
  console.log('✔ Usuário criado:', usuario.id_usuario);

  // 3. Transformar esse usuário em Administrador (testa o 1:1 de herança)
  const admin = await prisma.administrador.create({
    data: {
      id_usuario: usuario.id_usuario,
      nivel_permissao: 'ADMIN_GERAL',
      status_conta: 'Ativo',
      departamento: 'Diretoria',
    },
  });
  console.log('✔ Administrador criado para o usuário:', admin.id_usuario);

  // 4. Criar um Espaco (catálogo de tipos de espaço pra expositores)
  const espaco = await prisma.espaco.create({
    data: {
      tipo_espaco: 'Barraca 3x3',
      largura_espaco: 3.0,
      comprimento_espaco: 3.0,
      qtd_mesas: 1,
      largura_mesa: 1.2,
      comprimento_mesa: 0.6,
      quantidade_cadeiras: 2,
      qtd_credenciais_inclusas: 2,
      valor_base: 150.0,
      valor_taxa_ajudante: 20.0,
      valor_taxa_mesa_extra: 15.0,
      valor_taxa_cadeira_extra: 5.0,
    },
  });
  console.log('✔ Espaço criado:', espaco.id_espaco);

  // 5. Criar um Lote de ingresso pra essa edição
  const lote = await prisma.lote.create({
    data: {
      id_geektopia: geektopia.id_geektopia,
      nome_lote: 'Ingresso Sábado - 1º Lote',
      valor_ingresso: 30.0,
      quantidade_total: 100,
    },
  });
  console.log('✔ Lote criado:', lote.id_lote);

  // 6. Criar um Ingresso pra esse usuário
  // (testa a cadeia toda: Usuario -> Ingresso -> Lote -> Geektopia)
  const ingresso = await prisma.ingresso.create({
    data: {
      id_usuario: usuario.id_usuario,
      id_geektopia: geektopia.id_geektopia,
      id_lote: lote.id_lote,
      codigo_qr: 'QR-TESTE-0001',
      status_ingresso: 'Valido',
    },
  });
  console.log('✔ Ingresso criado:', ingresso.id_ingresso);

  console.log('\nSeed finalizado com sucesso! Cadeia testada:');
  console.log('Usuario -> Administrador');
  console.log('Usuario -> Ingresso -> Lote -> Geektopia');
  console.log('Espaco (catálogo, pronto pra testar Solicitacao_Espaco depois)');
}

main()
  .catch((e) => {
    console.error('Erro ao rodar o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
