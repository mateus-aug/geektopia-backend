// Nickname único por EDIÇÃO da Geektopia (pedido dos professores).
//
// O nickname é como o competidor aparece no chaveamento e no placar. Dois
// "Raul" na mesma edição confundem o público, o júri e a apresentação no palco.
// Em edições diferentes, tudo bem: cada edição tem as suas próprias chaves.
//
// QUEM "SEGURA" UM NICKNAME NUMA EDIÇÃO
// Competidor com inscrição não reprovada em QUALQUER competição daquela edição.
// Reprovado libera o nome; inscrição apagada (cancelada) também.
//
// O QUE CONTA COMO IGUAL
// "Raul", "raul", "RAUL " e "Ráúl" são o mesmo nome para quem lê no telão.
// A comparação ignora maiúsculas, acentos e espaços repetidos.
//
// POR QUE NÃO É UMA RESTRIÇÃO NO BANCO
// O nickname mora no Competidor (um por pessoa) e a edição chega por
// Inscrição -> Competição -> Geektopia. Não existe coluna onde um UNIQUE caiba
// sem migration — e o combinado é não mexer no banco. A regra fica aqui.

// Chave fixa da trava (ver travarEdicao). Qualquer número serve, desde que
// nenhuma outra parte do sistema use o mesmo para outra coisa.
const ESPACO_DA_TRAVA = 7301;

/** Forma comparável do nickname: sem acento, minúsculo, espaços normalizados. */
const normalizarNick = (nick) =>
  String(nick ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Erro de regra de negócio: o controller converte em 409. */
class NickEmUso extends Error {
  constructor(nickname) {
    super(
      `O nickname "${nickname}" já está em uso por outro competidor nesta edição da Geektopia. ` +
        'Escolha outro no seu perfil de competidor para continuar.'
    );
    this.name = 'NickEmUso';
    this.campo = 'nickname_competidor';
  }
}

/**
 * Fila única por edição durante a transação.
 *
 * SEM ISTO: duas pessoas chamadas "Raul" clicam em "inscrever" no mesmo
 * instante. As duas consultam, as duas veem "livre", as duas entram — o mesmo
 * problema de corrida do estoque de ingressos.
 *
 * COM ISTO: a segunda espera a primeira terminar. Quando consulta, a inscrição
 * da primeira já está gravada e ela recebe o 409.
 *
 * É uma trava "de aviso" do PostgreSQL (advisory lock): não tranca tabela
 * nenhuma, só faz quem pede a MESMA chave esperar. Solta sozinha no fim da
 * transação. Inscrições em edições diferentes não esperam umas pelas outras.
 *
 * $executeRaw (e não $queryRaw) porque a função devolve `void`, que o Prisma
 * não consegue ler como coluna.
 */
async function travarEdicao(tx, idGeektopia) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ESPACO_DA_TRAVA}::int, ${idGeektopia}::int)`;
}

/**
 * Lança NickEmUso se outro competidor já segura este nickname na edição.
 * Deve rodar DENTRO da transação, depois de travarEdicao.
 *
 * @param {object} db         cliente Prisma ou `tx` da transação
 * @param {{idUsuario:number, nickname:string|null, idGeektopia:number}} dados
 */
async function exigirNickLivre(db, { idUsuario, nickname, idGeektopia }) {
  const alvo = normalizarNick(nickname);
  if (!alvo) return; // sem nickname não há o que comparar

  // Traz os nicks de quem está na edição e compara aqui, porque o banco não
  // sabe ignorar acento sem a extensão unaccent. Uma edição tem dezenas de
  // competidores, não milhares — a lista é pequena.
  const rivais = await db.competidor.findMany({
    where: {
      id_usuario: { not: idUsuario },
      nickname_competidor: { not: null },
      inscricoes: {
        some: {
          status_inscricao: { not: 'Reprovado' },
          competicao: { id_geektopia: idGeektopia }
        }
      }
    },
    select: { nickname_competidor: true }
  });

  if (rivais.some((r) => normalizarNick(r.nickname_competidor) === alvo)) {
    throw new NickEmUso(nickname);
  }
}

/**
 * Edições ainda não encerradas em que o competidor tem inscrição ativa.
 * Usado quando ele troca o nickname no perfil: a troca não pode colidir em
 * nenhuma delas. Edição encerrada fica de fora — o placar dela já foi.
 *
 * @returns {Promise<number[]>} ids em ordem crescente (ver comentário no uso)
 */
async function edicoesEmAndamento(db, idUsuario) {
  const linhas = await db.inscricao_Competicao.findMany({
    where: {
      id_usuario: idUsuario,
      status_inscricao: { not: 'Reprovado' },
      competicao: { geektopia: { status_evento: { not: 'Encerrado' } } }
    },
    select: { competicao: { select: { id_geektopia: true } } }
  });
  return [...new Set(linhas.map((l) => l.competicao.id_geektopia))].sort((a, b) => a - b);
}

module.exports = { normalizarNick, NickEmUso, travarEdicao, exigirNickLivre, edicoesEmAndamento };
