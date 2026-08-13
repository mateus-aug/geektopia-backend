// Conversões de entrada usadas pelos controllers do Módulo 2.
//
// Nenhuma função aqui lança exceção nem responde requisição: elas só devolvem
// o valor convertido ou null. Quem decide o código HTTP e a mensagem é sempre
// o controller. Assim as mesmas regras servem também fora de uma requisição
// (num script, no seed) sem arrastar o Express junto.

// Converte o :id da URL em inteiro positivo. Devolve null se não servir.
function lerId(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

// Converte texto ISO em Date. Devolve null se a data não existir de verdade.
// Aceita só string: new Date(null) devolveria 1970 em vez de erro.
function lerData(valor) {
  if (typeof valor !== 'string') return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

// Limpa um texto, respeitando o limite da coluna. Devolve null se vier vazio,
// só com espaços, ou maior que o limite.
function lerTexto(valor, limite) {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 || limpo.length > limite ? null : limpo;
}

module.exports = { lerId, lerData, lerTexto };
