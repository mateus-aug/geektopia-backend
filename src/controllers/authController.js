const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { apagarArquivoLocal } = require('../utils/arquivos');
const { senhaAtendeRequisitos } = require('../utils/validarSenha');
const { validarUsuario, buscarConflito, NIVEIS_ADMIN } = require('../utils/validacaoUsuario');
const { validarGenero, validarSexualidade } = require('../utils/genero');
const { VERSAO_TERMOS } = require('../utils/termos');
const { contarVinculos, usuariosComAtividade } = require('../utils/vinculosUsuario');
const { lerId } = require('../utils/validadores');

// ===================================================
// 1. AUTENTICAÇÃO E CADASTRO
// ===================================================

// Cadastro de usuário
exports.register = async (req, res) => {
  try {
    // Todas as regras (formato, data, telefone, senha...) ficam em
    // validacaoUsuario.js, as mesmas usadas pelo painel do administrador.
    const { erro, campo, dados } = validarUsuario(req.body, {
      exigirSenha: true,
      exigirTelefone: true,
      exigirLocalizacao: true,
      exigirGenero: true
    });

    if (erro) {
      return res.status(400).json({ error: erro, campo });
    }

    // Termos de Uso e Política de Privacidade: sem aceite não há cadastro. Guardamos quando e qual versão.
    if (req.body.aceite_termos !== true) {
      return res.status(400).json({ error: 'Leia e aceite os Termos de Uso e a Política de Privacidade para criar a conta.', campo: 'aceitaTermos' });
    }

    const conflito = await buscarConflito(prisma, dados);
    if (conflito) {
      return res.status(409).json({ error: conflito.erro, campo: conflito.campo });
    }

    const { senha, ...resto } = dados;
    const newUser = await prisma.usuario.create({
      data: { ...resto, senha: await bcrypt.hash(senha, 10), termos_aceitos_em: new Date(), termos_versao: VERSAO_TERMOS }
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

    if (typeof email !== 'string' || !email.trim() || typeof senha !== 'string' || !senha) {
      return res.status(400).json({ error: 'Informe o e-mail e a senha.' });
    }

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

    // A senha é conferida antes: quem erra a senha não descobre se a conta existe ou está inativada.
    if (user.inativado_em) {
      return res.status(403).json({ error: 'Esta conta foi inativada. Fale com a organização do CCPOP para reativá-la.', inativa: true });
    }

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
    // avatar_url NÃO é aceito aqui: a foto só muda pelo upload-avatar. Antes,
    // dava para gravar o endereço de uma imagem de OUTRA pessoa (banner da
    // edição, foto de convidado...) e, no upload seguinte, o sistema apagava
    // esse arquivo achando que era o "avatar anterior". O front só ecoava o
    // valor atual neste campo, então ignorá-lo não muda nada para a tela.
    const { nickname } = req.body;

    // Nome, telefone, cidade e UF passam pelas MESMAS regras do cadastro.
    // Antes entravam crus: nome vazio (o nome some do canto da tela), UF "XX"
    // no relatório demográfico, e texto comprido demais virava 500.
    const basicos = {};
    for (const campo of ['nome_completo', 'telefone', 'cidade', 'estado']) {
      if (req.body[campo] !== undefined) basicos[campo] = req.body[campo];
    }
    const validacao = validarUsuario(basicos, { parcial: true });
    if (validacao.erro) return res.status(400).json({ error: validacao.erro, campo: validacao.campo });

    if (nickname !== undefined && nickname !== null && (typeof nickname !== 'string' || nickname.trim().length > 30)) {
      return res.status(400).json({ error: 'O nickname deve ter no máximo 30 caracteres.', campo: 'nickname' });
    }

    // Gênero e sexualidade só entram se vierem (o perfil pode salvar sem mexer neles).
    const extras = {};
    for (const [campo, validar] of [['genero', validarGenero], ['sexualidade', validarSexualidade]]) {
      if (req.body[campo] === undefined) continue;
      const r = validar(req.body[campo]);
      if (r.erro) return res.status(400).json({ error: r.erro, campo });
      if (campo === 'genero' && !r.valor) return res.status(400).json({ error: 'Selecione o gênero (ou "Prefiro não informar").', campo });
      extras[campo] = r.valor;
    }

    const dadosPerfil = {};
    if (typeof nickname === 'string' && nickname.trim() !== '') dadosPerfil.nickname = nickname.trim();

    const updatedUser = await prisma.usuario.update({
      where: { id_usuario: req.userId },
      data: {
        ...validacao.dados,
        ...extras,
        perfil: {
          upsert: {
            create: { nickname: dadosPerfil.nickname || null },
            update: dadosPerfil
          }
        }
      },
      include: { perfil: true }
    });

    delete updatedUser.senha;
    return res.json({ message: 'Perfil atualizado com sucesso!', user: updatedUser });
  } catch (error) {
    // Perfil.nickname é único no banco: repetido virava 500.
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Esse nickname já está em uso por outra pessoa. Escolha outro.', campo: 'nickname' });
    }
    // Conta apagada com token ainda válido.
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Conta não encontrada. Entre novamente.' });
    }
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
    const usuario = await prisma.usuario.findUnique({ where: { id_usuario: req.userId }, select: { senha: true } });
    if (!usuario) return res.status(404).json({ error: 'Conta não encontrada.' });

    // Ação sem volta para quem não tem histórico, e que tira o acesso de quem tem: pede a senha de novo.
    const senhaOk = typeof req.body?.senha === 'string' && await bcrypt.compare(req.body.senha, usuario.senha);
    if (!senhaOk) return res.status(403).json({ error: 'Confirme a sua senha para encerrar a conta.', campo: 'senha' });

    const vinculos = await contarVinculos(req.userId);

    // Conta com atividade (pedido, ingresso, inscrição, solicitação...) NUNCA é apagada: o histórico financeiro e a
    // lista de presença precisam ficar guardados. Ela é INATIVADA (soft delete): para de entrar, e o admin pode reativar.
    if (vinculos.total > 0) {
      await prisma.usuario.update({ where: { id_usuario: req.userId }, data: { inativado_em: new Date(), inativado_motivo: 'Encerrada pela própria pessoa' } });
      return res.json({
        message: 'Sua conta foi inativada. Os dados ficam guardados e você pode pedir a reativação à organização do CCPOP.',
        inativada: true,
        vinculos: vinculos.detalhes
      });
    }

    // Sem nenhuma atividade, não há histórico a proteger: a conta pode ser excluída de verdade.
    await prisma.usuario.delete({ where: { id_usuario: req.userId } });
    return res.json({ message: 'Sua conta foi excluída com sucesso.', inativada: false });
  } catch (error) {
    // Rede de segurança: se um vínculo novo surgir entre a contagem e o delete, o banco barra e inativamos.
    if (error.code === 'P2003') {
      await prisma.usuario.update({ where: { id_usuario: req.userId }, data: { inativado_em: new Date(), inativado_motivo: 'Encerrada pela própria pessoa' } }).catch(() => {});
      return res.json({ message: 'Sua conta foi inativada. Os dados ficam guardados e você pode pedir a reativação à organização do CCPOP.', inativada: true });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Conta não encontrada.' });
    }
    console.error('Erro ao encerrar conta:', error);
    return res.status(500).json({ error: 'Erro ao encerrar conta de usuário.' });
  }
};

// Upload de avatar
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
    }

    const avatarUrl = req.file.url;
    const anterior = await prisma.perfil.findUnique({ where: { id_usuario: req.userId }, select: { avatar_url: true } });

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

    // A foto antiga sai do armazenamento (evita acumular lixo a cada troca de foto).
    // Só apaga se o anterior estiver na pasta de avatares: proteção extra para
    // registros antigos que possam apontar para imagem de outra área do site.
    if (anterior?.avatar_url && anterior.avatar_url !== avatarUrl && anterior.avatar_url.includes('/avatars/')) {
      apagarArquivoLocal(anterior.avatar_url);
    }

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
// GET /api/auth/admin/users?pagina=1&limite=20&q=texto&tipo=admin|cliente&ordem=recentes|nome
//
// Paginada NO SERVIDOR: com milhares de usuários, mandar todos de uma vez
// pesaria no banco, na rede e no navegador. A busca vale para nome, e-mail e
// início do CPF (só dígitos).
exports.getAllUsers = async (req, res) => {
  try {
    const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 20, 1), 100);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';

    const where = {};
    if (q) {
      const digitos = q.replace(/\D/g, '');
      where.OR = [
        { nome_completo: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        ...(digitos.length >= 3 ? [{ cpf: { startsWith: digitos } }] : [])
      ];
    }
    if (req.query.tipo === 'admin') where.administrador = { isNot: null };
    if (req.query.tipo === 'cliente') where.administrador = { is: null };
    if (req.query.situacao === 'inativa') where.inativado_em = { not: null };
    if (req.query.situacao === 'ativa') where.inativado_em = null;

    const total = await prisma.usuario.count({ where });
    const paginas = Math.max(1, Math.ceil(total / limite));
    // Página fora do intervalo (ex.: filtrou e sobrou menos): cai na última.
    const pagina = Math.min(Math.max(parseInt(req.query.pagina, 10) || 1, 1), paginas);

    const orderBy = req.query.ordem === 'nome'
      ? [{ nome_completo: 'asc' }, { id_usuario: 'asc' }]
      : [{ data_cadastro: 'desc' }, { id_usuario: 'desc' }]; // desempate estável entre páginas

    const itens = await prisma.usuario.findMany({
      where,
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
        inativado_em: true,
        inativado_motivo: true,
        perfil: true,
        administrador: true
      },
      orderBy,
      skip: (pagina - 1) * limite,
      take: limite
    });

    // Quem tem atividade só pode ser inativado: a lista diz isso para a tela esconder o "Excluir".
    const comAtividade = await usuariosComAtividade(itens.map((u) => u.id_usuario));
    const itensComAtividade = itens.map((u) => ({ ...u, tem_atividade: comAtividade.has(u.id_usuario) }));

    return res.json({ itens: itensComAtividade, total, pagina, limite, paginas });
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    return res.status(500).json({ error: 'Erro ao buscar lista de usuários.' });
  }
};

// GET /api/auth/admin/users/:id_usuario - um usuário completo (para editar)
exports.obterUsuarioAdmin = async (req, res) => {
  try {
    const id = lerId(req.params.id_usuario);
    if (!id) return res.status(400).json({ error: 'Identificador inválido.' });

    const usuario = await prisma.usuario.findUnique({
      where: { id_usuario: id },
      select: {
        id_usuario: true, nome_completo: true, cpf: true, cnpj: true, passaporte: true, email: true,
        telefone: true, data_nascimento: true, estado: true, cidade: true, genero: true, sexualidade: true,
        data_cadastro: true, administrador: true, perfil: true
      }
    });

    if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado.' });
    return res.json(usuario);
  } catch (error) {
    console.error('Erro ao buscar usuário pelo painel ADM:', error);
    return res.status(500).json({ error: 'Erro ao buscar o usuário.' });
  }
};

// POST /api/auth/admin/users - o administrador cadastra um usuário
// Corpo: os campos do cadastro + nivel_permissao? (cria já como administrador)
exports.criarUsuarioAdmin = async (req, res) => {
  try {
    const { erro, campo, dados } = validarUsuario(req.body, { exigirSenha: true });
    if (erro) return res.status(400).json({ error: erro, campo });

    const nivel = req.body.nivel_permissao;
    if (nivel && !NIVEIS_ADMIN.includes(nivel)) {
      return res.status(400).json({ error: `O nível deve ser um destes: ${NIVEIS_ADMIN.join(', ')}.`, campo: 'nivel_permissao' });
    }

    const conflito = await buscarConflito(prisma, dados);
    if (conflito) return res.status(409).json({ error: conflito.erro, campo: conflito.campo });

    const { senha, ...resto } = dados;
    const novo = await prisma.usuario.create({
      data: {
        ...resto,
        senha: await bcrypt.hash(senha, 10),
        ...(nivel ? { administrador: { create: { nivel_permissao: nivel } } } : {})
      },
      include: { administrador: true }
    });

    delete novo.senha;
    return res.status(201).json({ message: 'Usuário cadastrado com sucesso!', user: novo });
  } catch (error) {
    console.error('Erro ao criar usuário pelo painel ADM:', error);
    return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
};

// [ADMIN] Promover um usuário a Administrador
exports.promoteToAdmin = async (req, res) => {
  try {
    const id_usuario = lerId(req.params.id_usuario);
    const { nivel_permissao } = req.body;

    if (!id_usuario) return res.status(400).json({ error: 'Identificador inválido.' });
    if (nivel_permissao !== undefined && !NIVEIS_ADMIN.includes(nivel_permissao)) {
      return res.status(400).json({ error: 'Nível de permissão inválido. Use: ' + NIVEIS_ADMIN.join(' ou ') + '.', campo: 'nivel_permissao' });
    }

    const targetUser = await prisma.usuario.findUnique({
      where: { id_usuario },
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
      id_usuario,
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
    const id = lerId(req.params.id_usuario);
    if (!id) return res.status(400).json({ error: 'Identificador inválido.' });

    if (id === req.userId) {
      return res.status(409).json({ error: 'Você não pode excluir a sua própria conta por aqui.' });
    }

    // Mesma trava da conta própria: conferir antes permite dizer o que impede,
    // em vez de devolver um P2003 genérico depois que o banco recusa.
    const vinculos = await contarVinculos(id);

    if (vinculos.total > 0) {
      return res.status(409).json({
        error:
          'Não é possível excluir este usuário porque existe histórico vinculado a ele: ' +
          vinculos.resumo + '. Use "Inativar": a conta deixa de funcionar e o histórico continua guardado.',
        vinculos: vinculos.detalhes
      });
    }

    await prisma.usuario.delete({ where: { id_usuario: id } });

    return res.json({ message: 'Usuário removido da base de dados com sucesso.' });
  } catch (error) {
    // P2003: há registros ligados (pedidos, ingressos...). Apagar destruiria histórico.
    if (error.code === 'P2003') {
      return res.status(409).json({ error: 'Não é possível excluir: este usuário tem pedidos, ingressos ou outros registros vinculados.' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }
    console.error('Erro ao excluir usuário pelo painel ADM:', error);
    return res.status(500).json({ error: 'Erro ao remover usuário.' });
  }
};

// [ADMIN] Inativar uma conta (soft delete): não entra mais, mas pedidos, ingressos e inscrições continuam guardados.
// PATCH /api/auth/admin/users/:id_usuario/inativar  { motivo? }
exports.adminInativarUsuario = async (req, res) => {
  try {
    const id = lerId(req.params.id_usuario);
    if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
    if (id === req.userId) return res.status(409).json({ error: 'Você não pode inativar a sua própria conta por aqui.' });

    const alvo = await prisma.usuario.findUnique({ where: { id_usuario: id }, select: { inativado_em: true, administrador: { select: { id_usuario: true } } } });
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (alvo.administrador) return res.status(409).json({ error: 'Este usuário é administrador. Remova o acesso de administrador antes de inativar a conta.' });
    if (alvo.inativado_em) return res.status(409).json({ error: 'Esta conta já está inativada.' });

    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim().slice(0, 200) : '';
    await prisma.usuario.update({ where: { id_usuario: id }, data: { inativado_em: new Date(), inativado_motivo: motivo || 'Inativada pela organização' } });
    return res.json({ message: 'Conta inativada. Os dados continuam guardados.' });
  } catch (error) {
    console.error('Erro ao inativar usuário:', error);
    return res.status(500).json({ error: 'Erro ao inativar a conta.' });
  }
};

// [ADMIN] Reativar uma conta inativada.
// PATCH /api/auth/admin/users/:id_usuario/reativar
exports.adminReativarUsuario = async (req, res) => {
  try {
    const id = lerId(req.params.id_usuario);
    if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
    const alvo = await prisma.usuario.findUnique({ where: { id_usuario: id }, select: { inativado_em: true } });
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });
    if (!alvo.inativado_em) return res.status(409).json({ error: 'Esta conta já está ativa.' });
    await prisma.usuario.update({ where: { id_usuario: id }, data: { inativado_em: null, inativado_motivo: null } });
    return res.json({ message: 'Conta reativada.' });
  } catch (error) {
    console.error('Erro ao reativar usuário:', error);
    return res.status(500).json({ error: 'Erro ao reativar a conta.' });
  }
};

// [ADMIN] Editar dados de qualquer usuário
// PUT /api/auth/admin/users/:id_usuario
// Edita os dados cadastrais (o que veio no corpo). Senha não muda por aqui.
exports.adminUpdateUser = async (req, res) => {
  try {
    const id = lerId(req.params.id_usuario);
    if (!id) return res.status(400).json({ error: 'Identificador inválido.' });

    const alvo = await prisma.usuario.findUnique({ where: { id_usuario: id } });
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const { erro, campo, dados } = validarUsuario(req.body, { parcial: true });
    if (erro) return res.status(400).json({ error: erro, campo });

    if (Object.keys(dados).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido foi enviado para atualização.' });
    }

    // Depois da edição o usuário precisa continuar com pelo menos um documento.
    const final = { cpf: alvo.cpf, cnpj: alvo.cnpj, passaporte: alvo.passaporte, ...dados };
    if (!final.cpf && !final.cnpj && !final.passaporte) {
      return res.status(400).json({ error: 'O usuário precisa ter ao menos um documento (CPF, CNPJ ou passaporte).', campo: 'documento' });
    }

    const conflito = await buscarConflito(prisma, dados, id);
    if (conflito) return res.status(409).json({ error: conflito.erro, campo: conflito.campo });

    const atualizado = await prisma.usuario.update({
      where: { id_usuario: id },
      data: dados,
      include: { administrador: true, perfil: true }
    });

    delete atualizado.senha;
    return res.json({ message: 'Usuário atualizado com sucesso!', user: atualizado });
  } catch (error) {
    console.error('Erro ao atualizar usuário pelo painel ADM:', error);
    return res.status(500).json({ error: 'Erro ao atualizar usuário.' });
  }
};

// [ADMIN] Remover privilégio de Administrador (a pessoa volta a ser Cliente)
exports.demoteAdmin = async (req, res) => {
  try {
    const id_usuario = lerId(req.params.id_usuario);
    if (!id_usuario) return res.status(400).json({ error: 'Identificador inválido.' });

    // Mesma trava da exclusão: ninguém rebaixa a si mesmo por aqui, para o
    // sistema nunca ficar sem administrador por engano.
    if (id_usuario === req.userId) {
      return res.status(409).json({ error: 'Você não pode remover os seus próprios privilégios de administrador.' });
    }

    const admin = await prisma.administrador.findUnique({
      where: { id_usuario }
    });

    if (!admin) {
      return res.status(404).json({ error: 'Este usuário não é administrador.' });
    }

    await prisma.administrador.delete({ where: { id_usuario } });

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
      select: { data_nascimento: true, genero: true, sexualidade: true, cidade: true, estado: true }
    });

    const total = usuarios.length;

    const porGenero = contarPor(usuarios, (u) => u.genero || 'Não informado');
    const porSexualidade = contarPor(usuarios, (u) => u.sexualidade || 'Não informada');
    const porCidade = contarPor(
      usuarios,
      (u) => (u.cidade ? `${u.cidade}${u.estado ? ' - ' + u.estado : ''}` : 'Não informada')
    );
    const porFaixaEtaria = contarPor(usuarios, (u) => faixaEtaria(u.data_nascimento));

    return res.json({
      total_usuarios: total,
      por_genero: paraLista(porGenero, total),
      por_sexualidade: paraLista(porSexualidade, total),
      por_cidade: paraLista(porCidade, total),
      por_faixa_etaria: paraLista(porFaixaEtaria, total)
    });
  } catch (error) {
    console.error('Erro ao gerar relatório demográfico:', error);
    return res.status(500).json({ error: 'Erro ao gerar o relatório demográfico.' });
  }
};