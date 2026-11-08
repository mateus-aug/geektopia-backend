const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// REVISOR DE PORTUGUÊS DO TEXTO VOLTADO AO USUÁRIO
//
// Mensagens de erro, títulos de notificação e textos de e-mail saem com o nome
// do CCPOP. Escrever "inscricao" ou "voce" para o público do conselho pega mal,
// e é fácil acontecer: quem digita num terminal sem UTF-8 perde o acento sem
// perceber — foi exatamente assim que dois e-mails de teste saíram errados.
//
// Este teste varre o código e falha se achar prosa sem acento. Não precisa de
// banco: roda sozinho, em menos de um segundo.
//
// O QUE ELE NÃO ACUSA (e por quê)
//   "O campo \"nome_competicao\" é obrigatório"  -> nome de campo entre aspas:
//        é o identificador real do JSON, com acento quebraria a API.
//   'esta competição'                            -> pronome (this), não o verbo.
//   'a organização publica no calendário'        -> verbo publicar, não o adjetivo.
//   termos: ['nao consigo entrar']               -> palavras-chave de busca,
//        propositalmente sem acento porque é o que a pessoa digita.

const RAIZ = path.join(__dirname, '..', 'src');

// REGRA GENERATIVA para a família "-ção / -são / -ões".
//
// Listar palavra por palavra é frágil: a primeira versão deste teste deixou
// passar "permissao" e "operacao" só porque não estavam na lista. Em português
// não existe palavra terminada nesses sons que dispense o acento, então vale
// uma regra em vez de um dicionário.
//
//   terminou em -cao  -> -ção     (operacao, permissao... ver abaixo)
//   terminou em -coes -> -ções
//   terminou em -sao  -> -são
//   terminou em -soes -> -sões
//   terminou em -oes  -> -ões     (questoes, razoes)
//   terminou em -ao   -> -ão      (padrao, orgao), menos a contração "ao"
function acentoDeTerminacao(palavra) {
  const p = palavra.toLowerCase();
  if (p === 'ao') return null;                       // contração "ao" é válida
  if (p.length < 3) return null;
  if (p.endsWith('coes')) return p.slice(0, -4) + 'ções';
  if (p.endsWith('soes')) return p.slice(0, -4) + 'sões';
  if (p.endsWith('oes')) return p.slice(0, -3) + 'ões';
  if (p.endsWith('cao')) return p.slice(0, -3) + 'ção';
  if (p.endsWith('sao')) return p.slice(0, -3) + 'são';
  if (p.endsWith('ao')) return p.slice(0, -2) + 'ão';
  return null;
}

// Palavras que, em prosa, estão SEMPRE erradas sem acento.
// A família "-ção/-são/-ões" fica por conta da regra acima.
const SEMPRE_ERRADO = {
  voce: 'você', voces: 'vocês', ja: 'já', estao: 'estão',
  tambem: 'também', ate: 'até', apos: 'após', sera: 'será', serao: 'serão',
  tera: 'terá', terao: 'terão', proxima: 'próxima', proximo: 'próximo',
  espaco: 'espaço', espacos: 'espaços',
  usuario: 'usuário', usuarios: 'usuários',
  codigo: 'código', codigos: 'códigos',
  numero: 'número', numeros: 'números',
  periodo: 'período', endereco: 'endereço', servico: 'serviço',
  disponivel: 'disponível', disponiveis: 'disponíveis',
  responsavel: 'responsável', responsaveis: 'responsáveis',
  obrigatorio: 'obrigatório', obrigatoria: 'obrigatória',
  obrigatorios: 'obrigatórios', obrigatorias: 'obrigatórias',
  minimo: 'mínimo', maximo: 'máximo',
  invalido: 'inválido', invalida: 'inválida',
  invalidos: 'inválidos', invalidas: 'inválidas',
  valido: 'válido', valida: 'válida',
  proprio: 'próprio', propria: 'própria',
  pagina: 'página', paginas: 'páginas',
  historico: 'histórico', automatico: 'automático', automatica: 'automática',
  titulo: 'título', titulos: 'títulos',
  ultimo: 'último', ultima: 'última', unico: 'único', unica: 'única',
  possivel: 'possível', impossivel: 'impossível',
  necessario: 'necessário', necessaria: 'necessária',
  relatorio: 'relatório', relatorios: 'relatórios',
  credito: 'crédito', debito: 'débito',
  duvida: 'dúvida', duvidas: 'dúvidas',
  ingresso_: 'ingresso', // placeholder inofensivo: 'ingresso' não leva acento
  mes: 'mês', pais: 'país', ninguem: 'ninguém', alguem: 'alguém',
  porem: 'porém', atraves: 'através', apoio_: 'apoio',
  area: 'área', areas: 'áreas', ja_: 'já'
};

// Remove as entradas placeholder (existem só para documentar que a palavra
// NÃO leva acento; mantê-las na lista causaria falso positivo).
delete SEMPRE_ERRADO.ingresso_;
delete SEMPRE_ERRADO.apoio_;
delete SEMPRE_ERRADO.ja_;

// Palavras que mudam de sentido com o acento. Só acusamos no contexto
// em que a forma acentuada é a correta.
const AMBIGUAS = [
  {
    palavra: 'esta',
    correta: 'está',
    // verbo quando vem antes de gerúndio, de preposição, de adjetivo de estado,
    // ou quando termina a frase. Antes de substantivo é pronome ("esta edição").
    ehErro: (depois) =>
      /^\s*(\w+ndo\b|em\b|no\b|na\b|com\b|para\b|sem\b|pronto\b|pronta\b|correto\b|correta\b|disponivel\b|disponível\b|aberto\b|aberta\b|fora\b|ativo\b|ativa\b|vazio\b|vazia\b|cheio\b|cheia\b)/i.test(depois) ||
      depois.trim() === '' ||
      /^\s*[.!?,]/.test(depois)
  },
  {
    palavra: 'publica',
    correta: 'pública',
    // adjetivo quando vem depois de determinante ou de substantivo feminino.
    ehErro: (_depois, antes) =>
      /\b(a|uma|da|na|à|area|área|pagina|página|rota|parte|chave|vitrine|lista|consulta|tela)\s+$/i.test(antes)
  },
  {
    palavra: 'continua',
    correta: 'contínua',
    ehErro: (_depois, antes) => /\b(a|uma|da|na|forma|entrega|melhoria)\s+$/i.test(antes)
  },
  {
    palavra: 'analise',
    correta: 'análise',
    // substantivo quando vem depois de preposição/artigo. Verbo em "que ele analise".
    ehErro: (_depois, antes) => /\b(a|da|de|em|na|para|sob|sua|uma|aguarda|aguardando)\s+$/i.test(antes)
  },
  {
    palavra: 'secretaria',
    correta: 'secretária',
    ehErro: () => false // no NEXUS é sempre o órgão, não a profissional
  }
];

// Chaves cujo valor é identificador/slug, não prosa.
const CHAVES_IGNORADAS = /^\s*(termos|id|categoria|relacionados|publicos|tipo|link|name|key|slug|rota|path)\s*:/;

function extrairStrings(linha) {
  // remove comentário de fim de linha, preservando o que estiver dentro de aspas
  const semComentario = linha.replace(/([^:"'`])\/\/.*$/, '$1');
  return semComentario.match(/(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g) || [];
}

function pareceProsa(s) {
  if (!/\s/.test(s)) return false;                       // palavra solta
  if (!/[a-zA-ZÀ-ÿ]{3,}\s+[a-zA-ZÀ-ÿ]{2,}/.test(s)) return false;
  if (/[{}<>;]|font-family|padding|margin|SELECT |FROM |JOIN |https?:\/\//i.test(s)) return false;
  return true;
}

// Tira os trechos entre aspas internas: são nomes de campo do JSON.
const semNomesDeCampo = (s) => s.replace(/["']([a-z0-9_]+)["']/gi, ' ');

function revisar(texto) {
  const achados = [];
  const limpo = semNomesDeCampo(texto);

  for (const [errada, certa] of Object.entries(SEMPRE_ERRADO)) {
    const re = new RegExp('(^|[^a-zA-ZÀ-ÿ])(' + errada + ')([^a-zA-ZÀ-ÿ]|$)', 'i');
    if (re.test(limpo)) achados.push(errada + ' → ' + certa);
  }

  // Regra generativa da família -ção/-são/-ões. Percorre palavra a palavra em
  // vez de consultar lista, para pegar também o que ninguém previu.
  for (const palavra of limpo.match(/[a-zA-Z]+/g) || []) {
    const sugerido = acentoDeTerminacao(palavra);
    if (sugerido && sugerido.toLowerCase() !== palavra.toLowerCase()) {
      const aviso = palavra.toLowerCase() + ' → ' + sugerido;
      if (!achados.includes(aviso)) achados.push(aviso);
    }
  }

  for (const amb of AMBIGUAS) {
    const re = new RegExp('(^|[^a-zA-ZÀ-ÿ])' + amb.palavra + '([^a-zA-ZÀ-ÿ]|$)', 'gi');
    let m;
    while ((m = re.exec(limpo)) !== null) {
      const antes = limpo.slice(0, m.index + m[1].length);
      const depois = limpo.slice(m.index + m[1].length + amb.palavra.length);
      if (amb.ehErro(depois, antes)) {
        achados.push(amb.palavra + ' → ' + amb.correta);
        break;
      }
    }
  }

  return achados;
}

function varrerArquivos(dir, saida = []) {
  for (const nome of fs.readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (fs.statSync(p).isDirectory()) { varrerArquivos(p, saida); continue; }
    if (!nome.endsWith('.js')) continue;

    fs.readFileSync(p, 'utf8').split('\n').forEach((linha, i) => {
      if (/^\s*(\/\/|\*)/.test(linha)) return;        // comentário
      if (CHAVES_IGNORADAS.test(linha)) return;        // slug/identificador

      for (const bruta of extrairStrings(linha)) {
        const s = bruta.slice(1, -1);
        if (!pareceProsa(s)) continue;
        const erros = revisar(s);
        if (erros.length) {
          saida.push({
            arquivo: path.relative(RAIZ, p).replace(/\\/g, '/'),
            linha: i + 1,
            erros,
            trecho: s.length > 80 ? s.slice(0, 80) + '…' : s
          });
        }
      }
    });
  }
  return saida;
}

// --------------------------------------------------------------------------

test('o revisor reconhece erro de acentuação em prosa', () => {
  assert.deepStrictEqual(revisar('A inscricao foi aprovada'), ['inscricao → inscrição']);
  assert.ok(revisar('Voce nao pode fazer isso').includes('voce → você'));
  assert.ok(revisar('Voce nao pode fazer isso').includes('nao → não'));
  assert.ok(revisar('O sistema esta funcionando').includes('esta → está'));
  assert.ok(revisar('O pedido esta em análise').includes('esta → está'));
  assert.ok(revisar('A area publica do site').includes('publica → pública'));
});

test('a regra generativa pega palavra que nenhuma lista previu', () => {
  // foram exatamente estas que a primeira versão, baseada em lista, deixou passar
  assert.ok(revisar('Voce nao tem permissao para esta operacao').includes('permissao → permissão'));
  assert.ok(revisar('Voce nao tem permissao para esta operacao').includes('operacao → operação'));
  // e outras que ninguém pensaria em listar
  assert.ok(revisar('Confira a versao do padrao usado').includes('versao → versão'));
  assert.ok(revisar('Confira a versao do padrao usado').includes('padrao → padrão'));
  assert.ok(revisar('Veja as opcoes e as condicoes').includes('opcoes → opções'));
  assert.ok(revisar('Veja as razoes da decisao').includes('razoes → razões'));
  assert.ok(revisar('A exclusao foi bloqueada').includes('exclusao → exclusão'));
  // a contração "ao" continua válida
  assert.deepStrictEqual(revisar('Volte ao início da página'), []);
});

test('o revisor NÃO acusa os casos legítimos', () => {
  // nome de campo entre aspas precisa continuar sem acento
  assert.deepStrictEqual(revisar('O campo "nome_competicao" é obrigatório e deve ter até 100 caracteres.'), []);
  assert.deepStrictEqual(revisar('O campo "id_espaco" deve ser um identificador válido.'), []);
  // "esta" como pronome
  assert.deepStrictEqual(revisar('Não é possível excluir esta competição porque há inscrições.'), []);
  assert.deepStrictEqual(revisar('Esta solicitação já foi analisada.'), []);
  // "publica" como verbo
  assert.deepStrictEqual(revisar('A organização analisa e publica no calendário do portal.'), []);
  // "analise" como verbo
  assert.deepStrictEqual(revisar('Aguarde que a diretoria analise o seu pedido.'), []);
  // texto correto não acusa nada
  assert.deepStrictEqual(revisar('A organização aprovou a sua inscrição. Sua vaga está confirmada.'), []);
});

test('nenhum texto do sistema está sem acento', () => {
  const achados = varrerArquivos(RAIZ);

  if (achados.length > 0) {
    const relatorio = achados
      .map((a) => `\n  ${a.arquivo}:${a.linha}  [${a.erros.join(', ')}]\n      "${a.trecho}"`)
      .join('');
    assert.fail(
      `${achados.length} trecho(s) com problema de acentuação:${relatorio}\n\n` +
      '  Corrija o texto. Se for nome de campo ou termo de busca, ' +
      'veja as regras no topo de tests/textos.test.js.'
    );
  }

  assert.strictEqual(achados.length, 0);
});
