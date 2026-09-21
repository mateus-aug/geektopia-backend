const { cpfComDigitosValidos, exigirDigitoVerificador, idadeEmAnos } = require('./validacaoUsuario');

// Dados de quem vai USAR cada ingresso (como nos sites de venda de ingresso): nome completo,
// documento e data de nascimento. Cada ingresso sai em nome de um titular.
//
// Corpo de cada titular: { nome_completo, tipo_documento: 'cpf' | 'passaporte', documento, data_nascimento: 'AAAA-MM-DD' }

const MAX_INGRESSOS_POR_PEDIDO = 10;

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

// Devolve { erro } ou { valor: { nome_completo, tipo_documento, documento, data_nascimento (Date), idade } }.
function validarTitular(t, posicao) {
  const rotulo = `Ingresso ${posicao}`;
  if (!t || typeof t !== 'object') return { erro: `${rotulo}: informe os dados do titular.` };

  const nome = String(t.nome_completo ?? '').trim().replace(/\s+/g, ' ');
  if (nome.length < 3 || nome.length > 150 || nome.split(' ').length < 2) {
    return { erro: `${rotulo}: informe o nome completo do titular (nome e sobrenome).` };
  }

  const tipo = t.tipo_documento === 'passaporte' ? 'passaporte' : 'cpf';
  let documento;
  if (tipo === 'cpf') {
    documento = soDigitos(t.documento);
    if (documento.length !== 11) return { erro: `${rotulo}: CPF inválido, deve ter 11 dígitos.` };
    if (exigirDigitoVerificador() && !cpfComDigitosValidos(documento)) return { erro: `${rotulo}: CPF inválido. Confira os números.` };
  } else {
    documento = String(t.documento ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (documento.length < 5 || documento.length > 20) return { erro: `${rotulo}: número do passaporte inválido.` };
  }

  const bruta = String(t.data_nascimento ?? '');
  const nasc = /^\d{4}-\d{2}-\d{2}$/.test(bruta) ? new Date(`${bruta}T00:00:00Z`) : null;
  if (!nasc || Number.isNaN(nasc.getTime()) || nasc.toISOString().slice(0, 10) !== bruta) {
    return { erro: `${rotulo}: data de nascimento inválida.` };
  }
  if (nasc > new Date()) return { erro: `${rotulo}: a data de nascimento não pode ser no futuro.` };
  const idade = idadeEmAnos(nasc);
  if (idade > 120) return { erro: `${rotulo}: data de nascimento inválida.` };

  return { valor: { nome_completo: nome, tipo_documento: tipo, documento, data_nascimento: bruta, idade } };
}

// Idade mínima que vale para um lote: a do lote ou, se não tiver, a classificação da edição.
const idadeExigida = (lote, edicao) => lote.idade_minima ?? (edicao.classificacao_etaria > 0 ? edicao.classificacao_etaria : null);

// Limite de ingressos do lote por pessoa. Meia-entrada tem 1 por pessoa mesmo sem configurar.
const limiteDoLote = (lote) => lote.limite_por_pessoa ?? (lote.categoria === 'Meia' ? 1 : null);

module.exports = { MAX_INGRESSOS_POR_PEDIDO, validarTitular, idadeExigida, limiteDoLote, soDigitos };
