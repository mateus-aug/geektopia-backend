const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

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

    // 4. Verificação de Duplicidade no Banco
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

    // 5. Criptografia de Senha e Fuso Horário (UTC-3)
    const hashedPassword = await bcrypt.hash(senha, 10);
    const dataFormatada = new Date(`${data_nascimento}T12:00:00-03:00`);

    // 6. Gravação na Tabela
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

    const updatedUser = await prisma.usuario.update({
      where: { id_usuario: req.userId },
      data: {
        nome_completo,
        telefone,
        cidade,
        perfil: {
          upsert: {
            create: { nickname, avatar_url },
            update: { nickname, avatar_url }
          }
        }
      },
      include: {
        perfil: true
      }
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
        telefone: true,
        cidade: true,
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

    const newAdmin = await prisma.administrador.create({
      data: {
        id_usuario: Number(id_usuario),
        nivel_acesso: nivel_acesso || 'STAFF'
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

