// Conversões de entrada. Devolvem o valor convertido ou null; quem responde é o controller.

// Inteiro positivo ou null.
function lerId(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

// Date válida ou null. Só aceita string.
function lerData(valor) {
  if (typeof valor !== 'string') return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

// Texto sem espaços nas pontas, até o limite, ou null.
function lerTexto(valor, limite) {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 || limpo.length > limite ? null : limpo;
}

// Link web: devolve a URL só se for http(s) e tiver até `limite` caracteres. Bloqueia javascript:, data: etc.
function lerLink(valor, limite = 2000) {
  const texto = lerTexto(valor, limite);
  if (!texto) return null;
  try {
    const u = new URL(texto);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

module.exports = { lerId, lerData, lerTexto, lerLink };
