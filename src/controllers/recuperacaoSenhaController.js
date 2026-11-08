const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const { senhaAtendeRequisitos } = require('../utils/validarSenha');
const { gerarToken, lerIdSemConferir, conferirToken } = require('../utils/tokenSenha');
const { enviarEmail, emailConfigurado } = require('../services/email');
const { notificar } = require('../services/notificacoes');

// RECUPERAÇÃO DE SENHA ("Esqueci a minha senha").
//
// Dois passos, duas rotas:
//   1. POST /api/auth/forgot-password  { email }               -> manda o link
//   2. POST /api/auth/reset-password   { token, nova_senha }   -> troca a senha
//
// A mecânica do token (expira, uso único, sem tabela no banco) está explicada
// em utils/tokenSenha.js. Aqui cuidamos das regras de quem pode o quê.

// Resposta SEMPRE igual no passo 1, exista ou não conta com aquele e-mail.
//
// POR QUE ISSO IMPORTA
// Se o sistema respondesse "e-mail não encontrado", qualquer pessoa poderia
// usar essa tela como consulta: joga uma lista de e-mails, vê quais dão
// "encontrado" e descobre quem tem cadastro no CCPOP. Isso é vazamento de
// dado pessoal — a pessoa não escolheu tornar público que participa do evento.
// Com a resposta fixa, a tela não responde nada sobre quem existe.
const RESPOSTA_NEUTRA = {
  message:
    'Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. ' +
    'O link vale por 1 hora. Confira também a caixa de spam.'
};

// Mensagem única para token ruim. Não diferencia expirado de inválido de já
// usado: contar qual foi o problema ajudaria quem está tentando adivinhar.
const LINK_INVALIDO =
  'Este link para redefinir a senha é inválido ou já expirou. ' +
  'Peça um novo link na tela de entrada.';

/**
 * PASSO 1 — pede o link de recuperação.
 * Público, sem token. Protegido por limite de tentativas na rota.
 */
exports.solicitar = async (req, res) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';

    // Formato obviamente errado volta 400. Isso não vaza nada: a resposta fala
    // do que foi digitado, não de quem existe no banco.
    if (!email || !email.includes('@') || email.length > 100) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }

    // Busca exata, igual à do login (utils/validacaoUsuario guarda o e-mail como
    // foi digitado, sem passar para minúsculas). Fazer busca sem diferenciar
    // maiúsculas aqui criaria uma armadilha: a recuperação funcionaria e depois
    // o login recusaria o mesmo e-mail escrito de outro jeito.
    const usuario = await prisma.usuario.findUnique({
      where: { email },
      select: { id_usuario: true, senha: true, email: true, nome_completo: true }
    });

    if (usuario) {
      const token = gerarToken(usuario);
      const caminho = `/redefinir-senha?token=${encodeURIComponent(token)}`;
      const primeiroNome = usuario.nome_completo.split(' ')[0];

      // Envio sem await de propósito, por dois motivos:
      //  - TEMPO: conversar com o servidor de SMTP leva segundos. Se a resposta
      //    esperasse o envio, quem existe demoraria muito mais que quem não
      //    existe — e esse atraso, sozinho, já diria se a conta existe.
      //  - ROBUSTEZ: enviarEmail() nunca lança erro, devolve false. Mesmo assim
      //    não dependemos do resultado para responder.
      enviarEmail({
        para: usuario.email,
        assunto: 'Redefinição de senha — NEXUS',
        texto:
          `Olá, ${primeiroNome}.\n\n` +
          'Recebemos um pedido para redefinir a senha da sua conta no NEXUS. ' +
          'Clique no botão abaixo para escolher uma nova senha.\n\n' +
          'O link vale por 1 hora e só pode ser usado uma vez.\n\n' +
          'Se não foi você que pediu, ignore esta mensagem: a sua senha atual ' +
          'continua valendo e nada muda na sua conta.',
        link: caminho
      });

      // Ajuda em desenvolvimento: sem SMTP configurado o link não chega a lugar
      // nenhum e a recuperação ficaria impossível de testar. Só imprime quando
      // o envio está desligado E fora de produção, para nunca deixar um token
      // de senha no log de um servidor de verdade.
      if (!emailConfigurado() && process.env.NODE_ENV !== 'production') {
        const base = String(process.env.URL_FRONTEND || '').split(',')[0].trim().replace(/\/$/, '');
        console.warn(`[recuperação de senha] SMTP desligado. Link: ${base}${caminho}`);
      }
    }

    return res.json(RESPOSTA_NEUTRA);
  } catch (erro) {
    console.error('Erro ao solicitar recuperação de senha:', erro);
    return res.status(500).json({ error: 'Erro interno ao solicitar a recuperação de senha.' });
  }
};

/**
 * PASSO 2 — usa o link e define a nova senha.
 * Público, sem token de login: quem esqueceu a senha não consegue entrar.
 * A autorização vem do próprio token do e-mail.
 */
exports.redefinir = async (req, res) => {
  try {
    const { token, nova_senha } = req.body || {};

    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'Link incompleto. Abra novamente o link do e-mail.' });
    }

    // A nova senha é checada ANTES de olhar o token: assim quem digitou uma
    // senha fraca recebe a dica e pode corrigir sem queimar o link.
    if (!senhaAtendeRequisitos(nova_senha)) {
      return res.status(400).json({
        error:
          'A nova senha deve ter no mínimo 8 caracteres, com letra maiúscula, ' +
          'minúscula, número e caractere especial.'
      });
    }

    // Só para saber qual hash buscar — ainda não é prova de nada.
    const idUsuario = lerIdSemConferir(token);
    if (idUsuario === null) {
      return res.status(400).json({ error: LINK_INVALIDO });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id_usuario: idUsuario },
      select: { id_usuario: true, senha: true, email: true }
    });

    // Usuário inexistente e assinatura errada dão a MESMA resposta, de propósito.
    if (!usuario || !conferirToken(token, usuario.senha)) {
      return res.status(400).json({ error: LINK_INVALIDO });
    }

    // A partir daqui o token está provado. Trocar a senha também invalida este
    // link, porque o hash muda e o segredo que o assinou deixa de existir.
    await prisma.usuario.update({
      where: { id_usuario: usuario.id_usuario },
      data: { senha: await bcrypt.hash(nova_senha, 10) }
    });

    // Avisa a pessoa de que a senha mudou, no sininho e por e-mail. Se quem
    // trocou não foi ela, este é o aviso que permite reagir a tempo.
    notificar(usuario.id_usuario, {
      tipo: 'senha_alterada',
      titulo: 'A senha da sua conta foi alterada',
      texto:
        'A senha da sua conta no NEXUS acabou de ser redefinida pelo link de ' +
        'recuperação. Se não foi você, entre em contato com a organização do ' +
        'CCPOP imediatamente.',
      link: '/entrar'
    });

    return res.json({
      message: 'Senha redefinida com sucesso! Já pode entrar com a nova senha.'
    });
  } catch (erro) {
    console.error('Erro ao redefinir a senha:', erro);
    return res.status(500).json({ error: 'Erro interno ao redefinir a senha.' });
  }
};
