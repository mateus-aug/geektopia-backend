const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { senhaAtendeRequisitos } = require('../utils/validarSenha');

// ===================================================
// 1. AUTENTICAÇÃO E CADASTRO
// ===================================================

// Cadastro de usuário
exports.register = async (req, res) => {
  try {
    const {
      nome_completo,
      cpf,
      cnpj,
      passaporte,
      email,
      senha,
      data_nascimento,
      telefone,
      estado,
      cidade,
      genero,
      sexualidade
    } = req.body;

    // 1. Validação do Formato de E-mail
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }

    // 2. Sanitização e Limpeza dos Campos
    const telefoneLimpo = telefone ? telefone.replace(/\D/g, '') : null;
    const cpfLimpo = cpf ? cpf.replace(/\D/g, '') : null;
    const cnpjLimpo = cnpj ? cnpj.replace(/\D/g, '') : null;
    const passaporteLimpo = passaporte ? passaporte.trim().toUpperCase() : null;

    // 3. Valida se ao menos um dos documentos foi preenchido
    if (!cpfLimpo && !cnpjLimpo && !passaporteLimpo) {
      return res.status(400).json({ error: 'Documento é obrigatório.' });
    }

    // 4. Valida tamanho dos documentos
    if (cpfLimpo && cpfLimpo.length !== 11) {
      return res.status(400).json({ error: 'CPF inválido: deve conter exatamente 11 dígitos.' });
    }
    if (cnpjLimpo && cnpjLimpo.length !== 14) {
      return res.status(400).json({ error: 'CNPJ inválido: deve conter exatamente 14 dígitos.' });
    }

    // 5. Valida a Data de Nascimento
    const dataFormatada = new Date(`${data_nascimento}T12:00:00-03:00`);
    const anoAtual = new Date().getFullYear();

    if (!data_nascimento || isNaN(dataFormatada.getTime())) {
      return res.status(400).json({ error: 'Data de nascimento inválida.' });
    }
    if (dataFormatada > new Date()) {
      return res.status(400).json({ error: 'Data de nascimento não pode ser no futuro.' });
    }
    if (dataFormatada.getFullYear() < anoAtual - 120) {
      return res.status(400).json({ error: 'Data de nascimento inválida: ano muito antigo.' });
    }

    // 6. Valida a senha
    if (!senhaAtendeRequisitos(senha)) {
      return res.status(400).json({
        error: 'A senha deve ter no mínimo 8 caracteres, com letra maiúscula, minúscula, número e caractere especial.'
      });
    }

    // 7. Verificação de Duplicidade no Banco
    const userExists = await prisma.usuario.findFirst({
      where: {
        OR: [
          { email },
          ...(cpfLimpo ? [{ cpf: cpfLimpo }] : []),
          ...(cnpjLimpo ? [{ cnpj: cnpjLimpo }] : []),
          ...(passaporteLimpo ? [{ passaporte: passaporteLimpo }] : [])
        ]
      }
    });

    if (userExists) {
      return res.status(400).json({ error: 'E-mail ou Documento já cadastrado no sistema.' });
    }

    // 8. Criptografia de Senha
    const hashedPassword = await bcrypt.hash(senha, 10);

    // 9. Gravação na Tabela
    const newUser = await prisma.usuario.create({
      data: {
        nome_completo,
        cpf: cpfLimpo,
        cnpj: cnpjLimpo,
        passaporte: passaporteLimpo,
        email,
        senha: hashedPassword,
        data_nascimento: dataFormatada,
        telefone: telefoneLimpo,
        estado: estado || null,
        cidade: cidade || null,
        genero: genero || null,
        sexualidade: sexualidade || null
      }
    });

    delete newUser.senha;

    return res.status(201).json({ message: 'Usuário cadastrado com sucesso!', user: newUser });
  } catch (error) {
    console.error('Erro no cadastro:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
};

// Login de usuário
exports.login = async (req, res) => {
  try {
    const { email, senha } = req.body;

    const user = await prisma.usuario.findUnique({
      where: { email },
      include: {
        administrador: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const passwordMatch = await bcrypt.compare(senha, user.senha);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const token = jwt.sign(
      { 
        id: user.id_usuario, 
        email: user.email,
        isAdmin: !!user.administrador 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    delete user.senha;

    return res.json({
      message: 'Login realizado com sucesso!',
      token,
      user
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
};

// ===================================================
// 2. MÓDULO DO PERFIL DO CLIENTE
// ===================================================

// Retornar perfil do usuário logado através do Token
exports.getMe = async (req, res) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { id_usuario: req.userId },
      include: {
        perfil: true,
        administrador: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    delete user.senha;
    return res.json(user);
  } catch (error) {
    console.error('Erro ao buscar perfil:', error);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
};

// Atualizar dados do perfil do usuário logado
exports.updateProfile = async (req, res) => {
  try {
    const { nome_completo, telefone, cidade, nickname, avatar_url } = req.body;

    const dadosPerfil = {};
    if (nickname !== undefined && nickname !== '') dadosPerfil.nickname = nickname;
    if (avatar_url !== undefined) dadosPerfil.avatar_url = avatar_url;

    const updatedUser = await prisma.usuario.update({
      where: { id_usuario: req.userId },
      data: {
        nome_completo,
        telefone,
        cidade,
        perfil: {
          upsert: {
            create: { nickname: nickname || null, avatar_url },
            update: dadosPerfil
          }
        }
      },
      include: { perfil: true }
    });

    delete updatedUser.senha;
    return res.json({ message: 'Perfil atualizado com sucesso!', user: updatedUser });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    return res.status(500).json({ error: 'Erro ao atualizar dados do perfil.' });
  }
};

// Alterar Senha estando logado
exports.changePassword = async (req, res) => {
  try {
    const { senha_atual, nova_senha } = req.body;

    const user = await prisma.usuario.findUnique({
      where: { id_usuario: req.userId }
    });

    if (!senhaAtendeRequisitos(nova_senha)) {
      return res.status(400).json({
        error: 'A nova senha deve ter no mínimo 8 caracteres, com letra maiúscula, minúscula, número e caractere especial.'
      });
    }

    const passwordMatch = await bcrypt.compare(senha_atual, user.senha);
    if (!passwordMatch) {
      return res.status(400).json({ error: 'A senha atual está incorreta.' });
    }

    const newHashedPassword = await bcrypt.hash(nova_senha, 10);
    await prisma.usuario.update({
      where: { id_usuario: req.userId },
      data: { senha: newHashedPassword }
    });

    return res.json({ message: 'Senha alterada com sucesso!' });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return res.status(500).json({ error: 'Erro interno ao alterar senha.' });
  }
};

// Excluir conta própria
exports.deleteMyAccount = async (req, res) => {
  try {
    await prisma.usuario.delete({
      where: { id_usuario: req.userId }
    });

    return res.json({ message: 'Sua conta foi excluída com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir conta:', error);
    return res.status(500).json({ error: 'Erro ao encerrar conta de usuário.' });
  }
};

// Upload de avatar
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
    }

    const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/avatars/${req.file.filename}`;

    await prisma.usuario.update({
      where: { id_usuario: req.userId },
      data: {
        perfil: {
          upsert: {
            create: { avatar_url: avatarUrl },
            update: { avatar_url: avatarUrl }
          }
        }
      }
    });

    return res.json({ message: 'Foto atualizada com sucesso!', avatar_url: avatarUrl });
  } catch (error) {
    console.error('Erro ao fazer upload do avatar:', error);
    return res.status(500).json({ error: 'Erro ao enviar foto.' });
  }
};

// ===================================================
// 3. MÓDULO ADMINISTRATIVO (EXCLUSIVO ADMINS)
// ===================================================

// [ADMIN] Listar todos os usuários da plataforma
exports.getAllUsers = async (req, res) => {
  try {
    const users = await prisma.usuario.findMany({
      select: {
        id_usuario: true,
        nome_completo: true,
        email: true,
        cpf: true,
        cnpj: true,       
        passaporte: true,
        telefone: true,
        cidade: true,
        estado: true,
        data_cadastro: true,
        perfil: true,
        administrador: true
      },
      orderBy: { data_cadastro: 'desc' }
    });

    return res.json(users);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    return res.status(500).json({ error: 'Erro ao buscar lista de usuários.' });
  }
};

// [ADMIN] Promover um usuário a Administrador
exports.promoteToAdmin = async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const { nivel_acesso } = req.body;

    const targetUser = await prisma.usuario.findUnique({
      where: { id_usuario: Number(id_usuario) },
      include: { administrador: true }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (targetUser.administrador) {
      return res.status(400).json({ error: 'Este usuário já possui permissão de Administrador.' });
    }

    const { nivel_permissao } = req.body; // ajuste a desestruturação lá em cima também

    const newAdmin = await prisma.administrador.create({
      data: {
      id_usuario: Number(id_usuario),
      nivel_permissao: nivel_permissao || 'ADMIN_CONTEUDO'
     }
    });

    return res.status(201).json({ message: 'Usuário promovido a administrador com sucesso!', admin: newAdmin });
  } catch (error) {
    console.error('Erro ao promover administrador:', error);
    return res.status(500).json({ error: 'Erro interno ao promover usuário.' });
  }
};

// [ADMIN] Excluir qualquer usuário por ID
exports.adminDeleteUser = async (req, res) => {
  try {
    const { id_usuario } = req.params;

    await prisma.usuario.delete({
      where: { id_usuario: Number(id_usuario) }
    });

    return res.json({ message: 'Usuário removido da base de dados com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir usuário pelo painel ADM:', error);
    return res.status(500).json({ error: 'Erro ao remover usuário.' });
  }
};

// [ADMIN] Editar dados de qualquer usuário
exports.adminUpdateUser = async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const { nome_completo, telefone, cidade, estado, email } = req.body;

    const targetUser = await prisma.usuario.findUnique({
      where: { id_usuario: Number(id_usuario) }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (email && email !== targetUser.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Informe um e-mail válido.' });
      }
      const emailEmUso = await prisma.usuario.findUnique({ where: { email } });
      if (emailEmUso) {
        return res.status(400).json({ error: 'Este e-mail já está em uso por outro usuário.' });
      }
    }

    const updatedUser = await prisma.usuario.update({
      where: { id_usuario: Number(id_usuario) },
      data: { nome_completo, telefone, cidade, estado, email },
      include: { administrador: true, perfil: true }
    });

    delete updatedUser.senha;
    return res.json({ message: 'Usuário atualizado com sucesso!', user: updatedUser });
  } catch (error) {
    console.error('Erro ao atualizar usuário pelo painel ADM:', error);
    return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
};

// [ADMIN] Remover privilégio de Administrador (rebaixar a Cliente)
exports.demoteAdmin = async (req, res) => {
  try {
    const { id_usuario } = req.params;

    const admin = await prisma.administrador.findUnique({
      where: { id_usuario: Number(id_usuario) }
    });

    if (!admin) {
      return res.status(404).json({ error: 'Este usuário não é administrador.' });
    }

    await prisma.administrador.delete({ where: { id_usuario: Number(id_usuario) } });

    return res.json({ message: 'Privilégios de administrador removidos com sucesso!' });
  } catch (error) {
    console.error('Erro ao rebaixar administrador:', error);
    return res.status(500).json({ error: 'Erro ao remover privilégios de administrador.' });
  }
};

// Calcula a idade em anos completos e devolve a faixa etária correspondente.
function faixaEtaria(dataNascimento) {
  const hoje = new Date();
  let idade = hoje.getFullYear() - dataNascimento.getFullYear();

  const aindaNaoFezAniversarioEsteAno =
    hoje.getMonth() < dataNascimento.getMonth() ||
    (hoje.getMonth() === dataNascimento.getMonth() && hoje.getDate() < dataNascimento.getDate());

  if (aindaNaoFezAniversarioEsteAno) idade -= 1;

  if (idade < 18) return 'Menor de 18';
  if (idade <= 24) return '18 a 24';
  if (idade <= 34) return '25 a 34';
  if (idade <= 44) return '35 a 44';
  return '45 ou mais';
}

// Conta quantas vezes cada valor (calculado por `chaveDe`) aparece na lista.
function contarPor(lista, chaveDe) {
  const contagem = new Map();
  for (const item of lista) {
    const chave = chaveDe(item);
    contagem.set(chave, (contagem.get(chave) || 0) + 1);
  }
  return contagem;
}

// Transforma a contagem num array ordenado (mais frequente primeiro), já com
// o percentual calculado — é o formato que o front vai exibir direto.
function paraLista(contagem, total) {
  return [...contagem.entries()]
    .map(([chave, quantidade]) => ({
      chave,
      quantidade,
      percentual: total > 0 ? Math.round((quantidade / total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

// [ADMIN] Relatório demográfico dos usuários cadastrados (cidade/estado,
// faixa etária e gênero). Pedido pela diretoria do CCPOP para prestar contas
// à parceria de incentivo cultural com a prefeitura.
//
// É intencionalmente simples: contagens e percentuais, sem gráficos — o
// objetivo agora é ter o dado disponível, não construir um painel visual
// completo (isso fica para uma etapa futura, se houver tempo).
exports.relatorioDemografico = async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: { data_nascimento: true, genero: true, cidade: true, estado: true }
    });

    const total = usuarios.length;

    const porGenero = contarPor(usuarios, (u) => u.genero || 'Não informado');
    const porCidade = contarPor(
      usuarios,
      (u) => (u.cidade ? `${u.cidade}${u.estado ? ' - ' + u.estado : ''}` : 'Não informada')
    );
    const porFaixaEtaria = contarPor(usuarios, (u) => faixaEtaria(u.data_nascimento));

    return res.json({
      total_usuarios: total,
      por_genero: paraLista(porGenero, total),
      por_cidade: paraLista(porCidade, total),
      por_faixa_etaria: paraLista(porFaixaEtaria, total)
    });
  } catch (error) {
    console.error('Erro ao gerar relatório demográfico:', error);
    return res.status(500).json({ error: 'Erro ao gerar o relatório demográfico.' });
  }
};
