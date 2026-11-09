const jwt = require('jsonwebtoken');

// Token do link "Confirmar meu e-mail", SEM tabela no banco (mesma ideia do token de recuperação de senha).
//   - Vale 48 horas.
//   - Leva o e-mail no próprio token: se o e-mail da conta mudar depois, o link antigo deixa de servir.
//   - Segredo próprio ('confirmar-email'): um token de login nunca confirma e-mail, e este nunca serve para entrar.
const VALIDADE = '48h';
const TIPO = 'confirmar-email';
const segredo = () => `${process.env.JWT_SECRET}|${TIPO}`;

function gerarTokenEmail(usuario) {
  return jwt.sign({ id: usuario.id_usuario, email: usuario.email, tipo: TIPO }, segredo(), { expiresIn: VALIDADE });
}

// Devolve { id, email } se o token for autêntico e estiver no prazo; senão null.
function lerTokenEmail(token) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  try {
    const dados = jwt.verify(token, segredo());
    return dados.tipo === TIPO && Number.isInteger(dados.id) && typeof dados.email === 'string' ? { id: dados.id, email: dados.email } : null;
  } catch {
    return null;
  }
}

module.exports = { gerarTokenEmail, lerTokenEmail };
