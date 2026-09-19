const SENHA_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function senhaAtendeRequisitos(senha) {
  return typeof senha === 'string' && SENHA_REGEX.test(senha);
}

module.exports = { senhaAtendeRequisitos };