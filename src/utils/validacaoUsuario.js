const { validarGenero, validarSexualidade } = require('./genero');
// Validação dos dados de usuário. Usada no cadastro público, na criação e na
// edição feita pelo administrador, para as três regras nunca divergirem.
//
// Não responde requisição nem lança exceção: devolve { erro, campo } (o campo
// permite ao front marcar o input certo) ou { dados } já normalizados para o
// Prisma. Quem escolhe o código HTTP é o controller.
//
// Sobre dados "de verdade": o FORMATO (11 dígitos, DDD válido, e-mail com
// domínio) é sempre conferido. O dígito verificador de CPF/CNPJ só é exigido em
// produção, para dar para testar com dados inventados durante o
// desenvolvimento. VALIDAR_DOCUMENTOS=true|false força o comportamento.
// Confirmar que o e-mail/telefone são de quem cadastrou é outro assunto
// (confirmação por e-mail), ainda por fazer.

const { senhaAtendeRequisitos } = require('./validarSenha');

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const NIVEIS_ADMIN = ['ADMIN_GERAL', 'ADMIN_CONTEUDO'];

// Idade mínima para ter conta. Quem é mais novo usa a conta de um responsável.
const IDADE_MINIMA_CADASTRO = 12;

function exigirDigitoVerificador() {
  const forcado = process.env.VALIDAR_DOCUMENTOS;
  if (forcado === 'true') return true;
  if (forcado === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

function cpfComDigitosValidos(cpf) {
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base) => {
    const soma = [...base].reduce((acc, n, i) => acc + Number(n) * (base.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9)) === Number(cpf[9]) && digito(cpf.slice(0, 10)) === Number(cpf[10]);
}

function cnpjComDigitosValidos(cnpj) {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(cnpj.slice(0, 12)) === Number(cnpj[12]) && digito(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

// Data no formato YYYY-MM-DD que exista de verdade (recusa 2001-02-30).
function lerDataNascimento(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const [a, m, d] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(a, m - 1, d, 12));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null;
  return data;
}

const erro = (campo, mensagem) => ({ erro: mensagem, campo });

// Idade em anos completos hoje (datas em UTC, como são gravadas).
function idadeEmAnos(data) {
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - data.getUTCFullYear();
  const fezAniversario = hoje.getUTCMonth() > data.getUTCMonth()
    || (hoje.getUTCMonth() === data.getUTCMonth() && hoje.getUTCDate() >= data.getUTCDate());
  return fezAniversario ? idade : idade - 1;
}

// Valida (e normaliza) os dados de um usuário.
//
// opcoes:
//   parcial          só valida o que veio no corpo (edição)
//   exigirSenha      senha obrigatória e verificada (criação)
//   exigirTelefone   telefone obrigatório (cadastro público)
//   exigirLocalizacao estado e cidade obrigatórios (cadastro público)
//   exigirGenero      gênero obrigatório (cadastro público)
function validarUsuario(corpo, opcoes = {}) {
  const { parcial = false, exigirSenha = false, exigirTelefone = false, exigirLocalizacao = false, exigirGenero = false } = opcoes;
  const dados = {};
  const veio = (campo) => corpo[campo] !== undefined;
  const obrigatorio = (campo) => !parcial || veio(campo);

  // ---- Nome
  if (obrigatorio('nome_completo')) {
    const nome = typeof corpo.nome_completo === 'string' ? corpo.nome_completo.trim().replace(/\s+/g, ' ') : '';
    if (nome.length < 3) return erro('nome_completo', 'Informe o nome completo (mínimo de 3 letras).');
    if (nome.length > 150) return erro('nome_completo', 'O nome deve ter no máximo 150 caracteres.');
    if (!/^\p{L}[\p{L}\s'.-]*$/u.test(nome)) {
      return erro('nome_completo', 'O nome só pode ter letras, espaços, apóstrofo, ponto e hífen.');
    }
    dados.nome_completo = nome;
  }

  // ---- Documento (CPF, CNPJ ou passaporte)
  const temDocumento = ['cpf', 'cnpj', 'passaporte'].some((c) => veio(c));
  if (!parcial || temDocumento) {
    const cpf = soDigitos(corpo.cpf);
    const cnpj = soDigitos(corpo.cnpj);
    const passaporte = typeof corpo.passaporte === 'string' ? corpo.passaporte.trim().toUpperCase() : '';

    if (!parcial && !cpf && !cnpj && !passaporte) {
      return erro('documento', 'Informe um documento (CPF, CNPJ ou passaporte).');
    }

    if (veio('cpf')) {
      if (cpf && cpf.length !== 11) return erro('cpf', 'CPF inválido: deve ter 11 dígitos.');
      if (cpf && exigirDigitoVerificador() && !cpfComDigitosValidos(cpf)) return erro('cpf', 'CPF inválido. Confira os números.');
      dados.cpf = cpf || null;
    }
    if (veio('cnpj')) {
      if (cnpj && cnpj.length !== 14) return erro('cnpj', 'CNPJ inválido: deve ter 14 dígitos.');
      if (cnpj && exigirDigitoVerificador() && !cnpjComDigitosValidos(cnpj)) return erro('cnpj', 'CNPJ inválido. Confira os números.');
      dados.cnpj = cnpj || null;
    }
    if (veio('passaporte')) {
      if (passaporte && !/^[A-Z0-9]{6,20}$/.test(passaporte)) {
        return erro('passaporte', 'Passaporte inválido: use de 6 a 20 letras e números, sem espaços.');
      }
      dados.passaporte = passaporte || null;
    }
  }

  // ---- E-mail
  if (obrigatorio('email')) {
    const email = typeof corpo.email === 'string' ? corpo.email.trim() : '';
    if (!email) return erro('email', 'Informe o e-mail.');
    if (email.length > 100) return erro('email', 'O e-mail deve ter no máximo 100 caracteres.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.includes('..')) {
      return erro('email', 'E-mail inválido. Use o formato nome@dominio.com.');
    }
    dados.email = email;
  }

  // ---- Telefone (DDD válido + 10 ou 11 dígitos; celular começa com 9)
  if (veio('telefone') || (!parcial && exigirTelefone)) {
    const tel = soDigitos(corpo.telefone);
    if (!tel) {
      if (exigirTelefone && obrigatorio('telefone')) return erro('telefone', 'Informe o telefone.');
      dados.telefone = null;
    } else {
      if (tel.length < 10 || tel.length > 11) return erro('telefone', 'Telefone inválido: informe DDD + número (10 ou 11 dígitos).');
      if (Number(tel.slice(0, 2)) < 11) return erro('telefone', 'DDD inválido.');
      if (tel.length === 11 && tel[2] !== '9') return erro('telefone', 'Celular inválido: o número deve começar com 9 depois do DDD.');
      dados.telefone = tel;
    }
  }

  // ---- Data de nascimento
  if (obrigatorio('data_nascimento')) {
    if (!corpo.data_nascimento) return erro('data_nascimento', 'Informe a data de nascimento.');
    const data = lerDataNascimento(corpo.data_nascimento);
    if (!data) return erro('data_nascimento', 'Data de nascimento inválida. Use uma data que exista (ex.: 1998-07-21).');
    if (data > new Date()) return erro('data_nascimento', 'A data de nascimento não pode ser no futuro.');
    if (data.getUTCFullYear() < new Date().getUTCFullYear() - 120) return erro('data_nascimento', 'Data de nascimento inválida: ano muito antigo.');
    if (idadeEmAnos(data) < IDADE_MINIMA_CADASTRO) {
      return erro('data_nascimento', `É preciso ter pelo menos ${IDADE_MINIMA_CADASTRO} anos para criar uma conta.`);
    }
    dados.data_nascimento = data;
  }

  // ---- Localização
  if (veio('estado') || (!parcial && exigirLocalizacao)) {
    const uf = typeof corpo.estado === 'string' ? corpo.estado.trim().toUpperCase() : '';
    if (!uf) {
      if (exigirLocalizacao) return erro('estado', 'Selecione o estado.');
      dados.estado = null;
    } else {
      if (!UFS.includes(uf)) return erro('estado', 'Estado inválido: use a sigla (ex.: PR).');
      dados.estado = uf;
    }
  }
  if (veio('cidade') || (!parcial && exigirLocalizacao)) {
    const cidade = typeof corpo.cidade === 'string' ? corpo.cidade.trim() : '';
    if (!cidade) {
      if (exigirLocalizacao) return erro('cidade', 'Selecione a cidade.');
      dados.cidade = null;
    } else {
      if (cidade.length > 100) return erro('cidade', 'A cidade deve ter no máximo 100 caracteres.');
      dados.cidade = cidade;
    }
  }

  // ---- Gênero (obrigatório no cadastro público) e sexualidade (opcional, feita no perfil)
  if (veio('genero') || (!parcial && exigirGenero)) {
    const g = validarGenero(corpo.genero);
    if (g.erro) return erro('genero', g.erro);
    if (!g.valor && exigirGenero) return erro('genero', 'Selecione o gênero (ou "Prefiro não informar").');
    dados.genero = g.valor;
  }
  if (veio('sexualidade')) {
    const x = validarSexualidade(corpo.sexualidade);
    if (x.erro) return erro('sexualidade', x.erro);
    dados.sexualidade = x.valor;
  }

  // ---- Senha (só na criação)
  if (exigirSenha) {
    if (typeof corpo.senha !== 'string' || !senhaAtendeRequisitos(corpo.senha)) {
      return erro('senha', 'A senha deve ter no mínimo 8 caracteres, com letra maiúscula, minúscula, número e caractere especial.');
    }
    // bcrypt ignora tudo depois de 72 bytes: melhor recusar do que truncar em silêncio.
    if (Buffer.byteLength(corpo.senha, 'utf8') > 72) return erro('senha', 'A senha deve ter no máximo 72 caracteres.');
    dados.senha = corpo.senha;
  }

  return { dados };
}

// Confere se e-mail ou documento já pertencem a OUTRO usuário. Devolve
// { erro, campo } no primeiro conflito, ou null.
async function buscarConflito(prisma, dados, ignorarId = null) {
  const outros = ignorarId ? { NOT: { id_usuario: ignorarId } } : {};
  const testes = [
    ['email', 'E-mail já cadastrado no sistema.'],
    ['cpf', 'CPF já cadastrado no sistema.'],
    ['cnpj', 'CNPJ já cadastrado no sistema.'],
    ['passaporte', 'Passaporte já cadastrado no sistema.']
  ];

  for (const [campo, mensagem] of testes) {
    if (!dados[campo]) continue;
    const existe = await prisma.usuario.findFirst({ where: { [campo]: dados[campo], ...outros }, select: { id_usuario: true } });
    if (existe) return erro(campo, mensagem);
  }
  return null;
}

module.exports = {
  validarUsuario, buscarConflito, NIVEIS_ADMIN, UFS, IDADE_MINIMA_CADASTRO,
  cpfComDigitosValidos, exigirDigitoVerificador, idadeEmAnos
};
