const jwt = require('jsonwebtoken');

// Token de redefinição de senha SEM tabela no banco.
//
// POR QUE SEM TABELA
// O jeito clássico é guardar o token numa tabela `token_recuperacao` e apagar
// depois do uso. Isso exigiria uma migration — e o combinado com o grupo é não
// tocar no banco. A saída é assinar o token com um segredo DERIVADO do hash da
// senha atual da pessoa:
//
//     segredo = JWT_SECRET + '|' + hash_bcrypt_da_senha_atual
//
// Isso resolve as três exigências de graça:
//   1. EXPIRA        o próprio JWT carrega a validade (1 hora).
//   2. USO ÚNICO     ao redefinir, o hash muda (bcrypt sorteia sal novo a cada
//                    vez, então o hash muda mesmo se a senha for a mesma). O
//                    segredo deixa de existir e a assinatura do token velho
//                    nunca mais fecha. Não precisa marcar nada como "usado".
//   3. SEM ESTADO    nada para guardar, nada para limpar depois.
//
// Efeito colateral bom: pedir dois links e usar o primeiro invalida o segundo,
// e trocar a senha pelo caminho normal (change-password) mata qualquer link de
// recuperação pendente.
//
// ANALOGIA
// É como um cadeado cuja chave é feita do molde da fechadura atual. Trocar a
// fechadura (a senha) não "cancela" a chave — ela simplesmente para de encaixar.

const VALIDADE = '1h';

// Marca o que o token é. Um token de login é assinado com o JWT_SECRET puro,
// então já não passaria na conferência; o campo é só um segundo cadeado barato.
const TIPO = 'recuperacao-senha';

/** Monta o segredo específico daquela pessoa naquele estado de senha. */
const segredoDe = (hashSenhaAtual) => `${process.env.JWT_SECRET}|${hashSenhaAtual}`;

/**
 * Gera o token que vai dentro do link do e-mail.
 * @param {{id_usuario:number, senha:string}} usuario registro vindo do banco
 * @returns {string}
 */
function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id_usuario, tipo: TIPO },
    segredoDe(usuario.senha),
    { expiresIn: VALIDADE }
  );
}

/**
 * Descobre de quem é o token SEM conferir a assinatura.
 *
 * Serve só para saber qual hash buscar no banco para montar o segredo — é o
 * ovo e a galinha: não dá para conferir a assinatura antes de saber de quem é.
 * O dado aqui é 100% controlado por quem mandou a requisição, então a única
 * coisa que ele pode fazer é escolher qual usuário será consultado. Se a
 * assinatura não fechar depois, `conferirToken` rejeita.
 *
 * @returns {number|null} id do usuário, ou null se o token nem é um JWT válido
 */
function lerIdSemConferir(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const dados = jwt.decode(token);
  if (!dados || typeof dados !== 'object') return null;
  return Number.isInteger(dados.id) ? dados.id : null;
}

/**
 * Confere assinatura, validade e tipo contra o hash atual da senha.
 * @returns {boolean} true só se o token é autêntico, não expirou e é de recuperação
 */
function conferirToken(token, hashSenhaAtual) {
  try {
    const dados = jwt.verify(token, segredoDe(hashSenhaAtual));
    return dados.tipo === TIPO;
  } catch (_erro) {
    // Assinatura errada, token expirado ou texto sem sentido: tudo isso é
    // "link inválido". Quem chamou não precisa saber qual dos três foi.
    return false;
  }
}

module.exports = { gerarToken, lerIdSemConferir, conferirToken, VALIDADE };
