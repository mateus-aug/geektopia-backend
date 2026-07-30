const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

// Cadastro de usuário
exports.register = async (req, res) => {
  try {
    const { nome_completo, cpf, email, senha, data_nascimento, telefone, cidade } = req.body;

    // Verificar se e-mail ou CPF já existem
    const userExists = await prisma.usuario.findFirst({
      where: {
        OR: [{ email }, { cpf }]
      }
    });

    if (userExists) {
      return res.status(400).json({ error: 'E-mail ou CPF já cadastrado no sistema.' });
    }

    // Criptografar senha
    const hashedPassword = await bcrypt.hash(senha, 10);

    // Criar usuário no banco
    const newUser = await prisma.usuario.create({
      data: {
        nome_completo,
        cpf,
        email,
        senha: hashedPassword,
        data_nascimento: data_nascimento ? new Date(data_nascimento) : null,
        telefone,
        cidade
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

    // Gerar token de sessão
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