const prisma = require('../config/prisma');
const { lerId } = require('../utils/validadores');
const R = require('../services/relatorios');

// RELATÓRIOS (só administradores). Um endpoint monta o painel inteiro com os filtros da query:
//   id_geektopia  edição            de / ate  período da COMPRA (AAAA-MM-DD)
//   estado, cidade, genero          de quem comprou      faixa  rótulo de faixa etária do TITULAR
//   base          'participantes' (quem tem ingresso, padrão) | 'cadastros' (todos os usuários)
//
// Cada ingresso conta uma pessoa. Cidade, estado e gênero vêm da conta de quem comprou; a idade vem do
// titular do ingresso (quem realmente vai ao evento), e só na falta dele da conta do comprador.
// Nada aqui expõe CPF, e-mail ou telefone: o relatório é agregado.

const dataFiltro = (v, fimDoDia) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return null;
  const d = new Date(`${v}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const lerFiltros = (q) => ({
  id_geektopia: q.id_geektopia ? lerId(q.id_geektopia) : null,
  de: dataFiltro(q.de, false),
  ate: dataFiltro(q.ate, true),
  estado: String(q.estado || '').slice(0, 2) || null,
  cidade: String(q.cidade || '').slice(0, 100) || null,
  genero: String(q.genero || '').slice(0, 50) || null,
  faixa: R.FAIXAS.some((f) => f.rotulo === q.faixa) || q.faixa === 'Não informada' ? q.faixa : null,
  base: q.base === 'cadastros' ? 'cadastros' : 'participantes'
});

const numero = (d) => (d === null || d === undefined ? 0 : Number(d));

exports.painel = async (req, res) => {
  try {
    const f = lerFiltros(req.query);
    if (req.query.id_geektopia && !f.id_geektopia) return res.status(400).json({ error: 'A edição informada é inválida.' });

    // ------------------------------------------------ filtros disponíveis e edições
    const edicoes = await prisma.geektopia.findMany({ select: { id_geektopia: true, nome_edicao: true, data_inicio: true }, orderBy: { data_inicio: 'desc' } });

    // ------------------------------------------------ ingressos (base dos números de venda e público)
    const ingressosBrutos = await prisma.ingresso.findMany({
      where: { ...(f.id_geektopia ? { id_geektopia: f.id_geektopia } : {}) },
      select: {
        id_ingresso: true, id_geektopia: true, status_ingresso: true, data_checkin: true, data_nascimento_titular: true,
        lote: { select: { id_lote: true, nome_lote: true, categoria: true } },
        usuario: { select: { id_usuario: true, cidade: true, estado: true, genero: true, data_nascimento: true } },
        itemPedido: { select: { preco_unitario_momento: true, pedido: { select: { data_pedido: true } } } }
      }
    });

    const nomeEdicao = Object.fromEntries(edicoes.map((e) => [e.id_geektopia, e.nome_edicao]));
    const linhas = ingressosBrutos.map((i) => ({
      id: i.id_ingresso, edicao: i.id_geektopia, status: i.status_ingresso, checkin: i.data_checkin,
      lote: i.lote.nome_lote, categoria: i.lote.categoria || 'Inteira', id_lote: i.lote.id_lote,
      valor: numero(i.itemPedido?.preco_unitario_momento), data: i.itemPedido?.pedido?.data_pedido || null,
      cortesia: !i.itemPedido,
      comprador: i.usuario.id_usuario,
      pessoa: { cidade: i.usuario.cidade, estado: i.usuario.estado, genero: i.usuario.genero, idade: R.idadeEm(i.data_nascimento_titular || i.usuario.data_nascimento) }
    }));

    const noPeriodo = linhas.filter((l) => (!f.de || (l.data && l.data >= f.de)) && (!f.ate || (l.data && l.data <= f.ate)));
    const filtradas = noPeriodo.filter((l) => R.passaNoFiltro(l.pessoa, f));
    const vendidos = filtradas.filter((l) => l.status !== 'Cancelado');
    const cancelados = filtradas.length - vendidos.length;

    // ------------------------------------------------ público (demografia)
    let pessoas;
    if (f.base === 'cadastros') {
      const us = await prisma.usuario.findMany({ select: { cidade: true, estado: true, genero: true, data_nascimento: true } });
      pessoas = us.map((u) => ({ cidade: u.cidade, estado: u.estado, genero: u.genero, idade: R.idadeEm(u.data_nascimento) })).filter((p) => R.passaNoFiltro(p, f));
    } else {
      pessoas = vendidos.map((l) => l.pessoa);
    }
    const demografia = R.demografia(pessoas);

    // ------------------------------------------------ vendas
    const receita = R.arred(vendidos.reduce((s, l) => s + l.valor, 0));
    const pagos = vendidos.filter((l) => !l.cortesia).length;
    const checkins = vendidos.filter((l) => l.status === 'Utilizado').length;

    const agrupar = (chaveFn, rotuloFn) => {
      const m = new Map();
      for (const l of vendidos) {
        const k = chaveFn(l);
        const a = m.get(k) || { rotulo: rotuloFn(l), ingressos: 0, receita: 0, checkins: 0 };
        a.ingressos += 1; a.receita = R.arred(a.receita + l.valor); if (l.status === 'Utilizado') a.checkins += 1;
        m.set(k, a);
      }
      return [...m.values()].sort((a, b) => b.ingressos - a.ingressos);
    };
    const porEdicao = agrupar((l) => l.edicao, (l) => nomeEdicao[l.edicao] || `Edição ${l.edicao}`);
    const porLote = agrupar((l) => `${l.edicao}|${l.id_lote}`, (l) => `${l.lote}${f.id_geektopia ? '' : ` · ${nomeEdicao[l.edicao] || ''}`}`);
    const porCategoria = agrupar((l) => l.categoria, (l) => l.categoria);

    const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, quantidade: 0 }));
    for (const l of vendidos) if (l.checkin) porHora[(new Date(l.checkin).getUTCHours() + 21) % 24].quantidade += 1;

    // ------------------------------------------------ competições e expositores (por edição, sem filtros demográficos)
    const filtroEd = f.id_geektopia ? { id_geektopia: f.id_geektopia } : {};
    const competicoes = await prisma.competicao.findMany({
      where: filtroEd,
      select: { nome_competicao: true, modalidade: true, geektopia: { select: { nome_edicao: true } }, inscricoes: { select: { status_inscricao: true } } }
    });
    const espacos = await prisma.solicitacao_Espaco.findMany({
      where: filtroEd,
      select: { status_solicitacao: true, valor_total_final: true, pedido: { select: { status_pedido: true } } }
    });
    const espacoPago = espacos.filter((e) => e.status_solicitacao === 'Aprovado' && e.pedido?.status_pedido === 'Pago');

    // ------------------------------------------------ filtros para os seletores (a partir dos ingressos do período)
    const universo = f.base === 'cadastros' ? pessoas : noPeriodo.filter((l) => l.status !== 'Cancelado').map((l) => l.pessoa);
    const cidades = [...new Map(universo.filter((p) => p.cidade).map((p) => [R.chaveTexto(p.cidade), R.capitalizar(p.cidade)])).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const estados = [...new Set(universo.filter((p) => p.estado).map((p) => p.estado.toUpperCase()))].sort();
    const generos = [...new Map(universo.filter((p) => p.genero).map((p) => [R.chaveTexto(p.genero), R.capitalizar(p.genero)])).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return res.json({
      filtros_aplicados: { ...f, de: req.query.de || null, ate: req.query.ate || null },
      opcoes: { edicoes: edicoes.map((e) => ({ id: e.id_geektopia, nome: e.nome_edicao })), cidades, estados, generos, faixas: [...R.FAIXAS.map((x) => x.rotulo), 'Não informada'] },
      resumo: {
        ingressos_vendidos: vendidos.length,
        receita_ingressos: receita,
        ingressos_pagos: pagos,
        cortesias: vendidos.length - pagos,
        ticket_medio: pagos ? R.arred(receita / pagos) : 0,
        checkins,
        taxa_comparecimento: vendidos.length ? R.arred((checkins / vendidos.length) * 100) : 0,
        compradores_unicos: new Set(vendidos.map((l) => l.comprador)).size,
        cancelados,
        cidades_distintas: demografia.por_cidade.filter((c) => c.chave !== 'nao').length,
        total_pessoas: pessoas.length
      },
      publico: demografia,
      vendas: { por_dia: R.vendasPorDia(vendidos.map((l) => ({ data: l.data, valor: l.valor })).filter((v) => v.data)), por_edicao: porEdicao, por_lote: porLote, por_categoria: porCategoria },
      checkins_por_hora: porHora.filter((h) => h.quantidade > 0),
      competicoes: competicoes.map((c) => {
        const conta = (s) => c.inscricoes.filter((i) => i.status_inscricao === s).length;
        return { nome: c.nome_competicao || 'Sem nome', edicao: c.geektopia?.nome_edicao || '', modalidade: c.modalidade || '', inscricoes: c.inscricoes.length, aprovadas: conta('Aprovado'), em_analise: conta('EmAnalise'), aguardando_pagamento: conta('AguardandoPagamento'), reprovadas: conta('Reprovado') };
      }),
      expositores: {
        solicitacoes: espacos.length,
        em_analise: espacos.filter((e) => e.status_solicitacao === 'EmAnalise').length,
        aprovadas: espacos.filter((e) => e.status_solicitacao === 'Aprovado').length,
        reprovadas: espacos.filter((e) => e.status_solicitacao === 'Reprovado').length,
        confirmados_pagos: espacoPago.length,
        receita_taxas: R.arred(espacoPago.reduce((s, e) => s + numero(e.valor_total_final), 0))
      }
    });
  } catch (e) {
    console.error('Erro ao montar o painel de relatórios:', e);
    return res.status(500).json({ error: 'Erro ao montar o relatório.' });
  }
};
