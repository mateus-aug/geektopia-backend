const prisma = require('../config/prisma');

// Conta a "atividade" de um usuário antes de permitir a exclusão da conta.
//
// POR QUE ISSO EXISTE
// Apagar um usuário que já comprou, se inscreveu ou expôs destruiria histórico
// financeiro e a lista de presença do evento — registros que a organização
// precisa manter. O banco já impede, mas de um jeito ruim: a operação estoura
// no meio e o Prisma devolve P2003, um erro genérico que vira 500 na cara de
// quem clicou. Contar antes permite responder 409 dizendo exatamente o que
// está no caminho.
//
// O QUE REALMENTE BLOQUEIA (levantado da migration, não do schema)
// Direto em Usuario, com ON DELETE RESTRICT:
//   Pedido · Ingresso · Credencial · Feedback
// Indireto, através dos perfis que são CASCADE a partir de Usuario:
//   Competidor   -> Inscricao_Competicao, Equipe_Competicao (líder)   RESTRICT
//   Expositor    -> Solicitacao_Espaco                                RESTRICT
//   Organizador  -> Evento_Externo                                    RESTRICT
//
// A pegadinha está no indireto: apagar o Usuario dispara o cascade que tenta
// apagar o Competidor, e aí o RESTRICT da inscrição barra. O erro vem de uma
// constraint aninhada, ainda mais difícil de ler.
//
// NÃO bloqueiam (somem junto, por CASCADE): Perfil, Participante, Competidor,
// Expositor, Administrador, Organizador_Externo e Notificacao.

// Rótulos no singular e no plural, para a mensagem sair em português decente.
const ROTULOS = {
  pedidos: ['pedido', 'pedidos'],
  ingressos: ['ingresso', 'ingressos'],
  credenciais: ['credencial', 'credenciais'],
  feedbacks: ['avaliação enviada', 'avaliações enviadas'],
  inscricoes: ['inscrição em competição', 'inscrições em competições'],
  equipes_lideradas: ['equipe liderada', 'equipes lideradas'],
  solicitacoes_espaco: ['solicitação de espaço', 'solicitações de espaço'],
  eventos_comunidade: ['evento da comunidade', 'eventos da comunidade'],
  // Perfis de participação: têm portfólio, nickname e análise da diretoria. Contam como atividade mesmo sem inscrição.
  perfil_expositor: ['perfil de expositor', 'perfis de expositor'],
  perfil_competidor: ['perfil de competidor', 'perfis de competidor'],
  perfil_organizador: ['perfil de organizador de eventos', 'perfis de organizador de eventos']
};

/**
 * Conta tudo que impede a exclusão da conta.
 *
 * @param {number} idUsuario
 * @returns {Promise<{total:number, detalhes:object, resumo:string}>}
 *          `detalhes` traz só o que é maior que zero, para o front listar.
 *          `resumo` é a frase pronta ("2 pedidos e 1 ingresso").
 */
async function contarVinculos(idUsuario) {
  // Uma ida só ao banco para as oito contagens.
  const [
    pedidos,
    ingressos,
    credenciais,
    feedbacks,
    inscricoes,
    equipesLideradas,
    solicitacoes,
    eventos,
    perfilExpositor,
    perfilCompetidor,
    perfilOrganizador
  ] = await Promise.all([
    prisma.pedido.count({ where: { id_usuario: idUsuario } }),
    prisma.ingresso.count({ where: { id_usuario: idUsuario } }),
    prisma.credencial.count({ where: { id_usuario: idUsuario } }),
    prisma.feedback.count({ where: { id_usuario: idUsuario } }),
    // As três abaixo usam a própria chave do perfil, que é o id do usuário.
    prisma.inscricao_Competicao.count({ where: { id_usuario: idUsuario } }),
    prisma.equipe_Competicao.count({ where: { id_lider: idUsuario } }),
    prisma.solicitacao_Espaco.count({ where: { id_usuario: idUsuario } }),
    prisma.evento_Externo.count({ where: { id_organizador: idUsuario } }),
    prisma.expositor.count({ where: { id_usuario: idUsuario } }),
    prisma.competidor.count({ where: { id_usuario: idUsuario } }),
    prisma.organizador_Externo.count({ where: { id_usuario: idUsuario } })
  ]);

  const bruto = {
    pedidos,
    ingressos,
    credenciais,
    feedbacks,
    inscricoes,
    equipes_lideradas: equipesLideradas,
    solicitacoes_espaco: solicitacoes,
    eventos_comunidade: eventos,
    perfil_expositor: perfilExpositor,
    perfil_competidor: perfilCompetidor,
    perfil_organizador: perfilOrganizador
  };

  // Só o que existe entra no detalhe — devolver uma pilha de zeros não ajuda ninguém.
  const detalhes = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (valor > 0) detalhes[chave] = valor;
  }

  const total = Object.values(detalhes).reduce((soma, n) => soma + n, 0);

  // Monta "2 pedidos, 1 ingresso e 3 inscrições em competições".
  const partes = Object.entries(detalhes).map(([chave, n]) => {
    const [singular, plural] = ROTULOS[chave];
    return `${n} ${n === 1 ? singular : plural}`;
  });

  const resumo =
    partes.length === 0
      ? ''
      : partes.length === 1
        ? partes[0]
        : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`;

  return { total, detalhes, resumo };
}

/**
 * Quais destes usuários têm alguma atividade? Uma consulta por tipo para a lista inteira (e não oito por pessoa),
 * usada na lista do painel para esconder "Excluir" de quem só pode ser inativado.
 *
 * @param {number[]} ids
 * @returns {Promise<Set<number>>} ids com pelo menos uma atividade
 */
async function usuariosComAtividade(ids) {
  if (ids.length === 0) return new Set();
  const por = (modelo, campo) => prisma[modelo].findMany({ where: { [campo]: { in: ids } }, select: { [campo]: true }, distinct: [campo] });
  const listas = await Promise.all([
    por('pedido', 'id_usuario'), por('ingresso', 'id_usuario'), por('credencial', 'id_usuario'), por('feedback', 'id_usuario'),
    por('inscricao_Competicao', 'id_usuario'), por('equipe_Competicao', 'id_lider'), por('solicitacao_Espaco', 'id_usuario'),
    por('evento_Externo', 'id_organizador'), por('expositor', 'id_usuario'), por('competidor', 'id_usuario'), por('organizador_Externo', 'id_usuario')
  ]);
  const campos = ['id_usuario', 'id_usuario', 'id_usuario', 'id_usuario', 'id_usuario', 'id_lider', 'id_usuario', 'id_organizador', 'id_usuario', 'id_usuario', 'id_usuario'];
  const com = new Set();
  listas.forEach((linhas, i) => linhas.forEach((l) => com.add(l[campos[i]])));
  return com;
}

module.exports = { contarVinculos, usuariosComAtividade };
