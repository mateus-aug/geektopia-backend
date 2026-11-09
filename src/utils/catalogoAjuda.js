// Catálogo do Sistema de Ajuda do NEXUS.
//
// É conteúdo estático: não vem do banco e não é editável pelo painel. A decisão
// é proposital — a ajuda descreve COMO O SISTEMA FUNCIONA, então ela acompanha
// o código. Se uma tela muda, o artigo correspondente muda no mesmo commit.
//
// Cada artigo declara para quais PÚBLICOS ele serve. Artigos de 'admin' só
// aparecem para quem está logado como administrador — não por sigilo, mas
// porque instrução de bastidor confunde o visitante.
//
// Para adicionar um artigo: inclua o objeto em ARTIGOS com um `id` em
// minúsculas com hifens. O campo `termos` alimenta a busca; coloque ali as
// palavras que a pessoa realmente digitaria, inclusive sem acento.

// Públicos atendidos. Quem não está logado enxerga tudo menos 'admin'.
const PUBLICOS = [
  { id: 'visitante', titulo: 'Visitante', descricao: 'Quem vai ao evento, compra ingresso e acompanha a programação.' },
  { id: 'competidor', titulo: 'Competidor', descricao: 'Quem se inscreve nas competições de cosplay, K-pop, games e afins.' },
  { id: 'expositor', titulo: 'Expositor', descricao: 'Lojistas, artistas e projetos que montam estande no evento.' },
  { id: 'organizador', titulo: 'Organizador parceiro', descricao: 'Quem divulga eventos da comunidade no calendário do CCPOP.' },
  { id: 'admin', titulo: 'Equipe CCPOP', descricao: 'Diretoria e pessoas conselheiras que administram a plataforma.' }
];

const CATEGORIAS = [
  { id: 'primeiros-passos', titulo: 'Primeiros passos', descricao: 'Criar conta, entrar e acompanhar avisos.', ordem: 1 },
  { id: 'ingressos', titulo: 'Ingressos', descricao: 'Comprar, pagar e usar o ingresso no dia do evento.', ordem: 2 },
  { id: 'competicoes', titulo: 'Competições', descricao: 'Inscrever-se, pagar a taxa e acompanhar a análise.', ordem: 3 },
  { id: 'expositores', titulo: 'Espaço para expositores', descricao: 'Pedir estande, escolher extras e acompanhar a aprovação.', ordem: 4 },
  { id: 'comunidade', titulo: 'Eventos da comunidade', descricao: 'Divulgar um evento geek da região no calendário.', ordem: 5 },
  { id: 'conta', titulo: 'Conta e privacidade', descricao: 'Senha, dados pessoais e encerramento de conta.', ordem: 6 },
  { id: 'administracao', titulo: 'Administração', descricao: 'Operação da plataforma pela equipe do CCPOP.', ordem: 7 }
];

const ARTIGOS = [
  // ------------------------------------------------------ primeiros passos
  {
    id: 'criar-conta',
    titulo: 'Como criar a sua conta',
    categoria: 'primeiros-passos',
    publicos: ['visitante', 'competidor', 'expositor', 'organizador'],
    resumo: 'Uma conta só serve para tudo: ingressos, competições e exposição.',
    passos: [
      'Clique em "Cadastrar" no topo da página.',
      'Informe nome completo, e-mail, uma senha e a sua data de nascimento.',
      'CPF, telefone e cidade são opcionais no cadastro, mas ajudam na hora da compra.',
      'Aceite os termos de uso e confirme.',
      'Pronto: você já entra direto, sem precisar confirmar por e-mail.'
    ],
    observacoes: [
      'O e-mail e o CPF não podem se repetir no sistema. Se aparecer aviso de duplicidade, você provavelmente já tem conta.',
      'Menores de idade precisam de um responsável vinculado para participar de competições.'
    ],
    relacionados: ['entrar-na-conta', 'esqueci-senha', 'editar-perfil'],
    termos: ['cadastro', 'cadastrar', 'criar conta', 'registrar', 'nova conta', 'sign up']
  },
  {
    id: 'entrar-na-conta',
    titulo: 'Como entrar na sua conta',
    categoria: 'primeiros-passos',
    publicos: ['visitante', 'competidor', 'expositor', 'organizador', 'admin'],
    resumo: 'Login com e-mail e senha. A sessão vale por 7 dias.',
    passos: [
      'Clique em "Entrar".',
      'Digite o e-mail e a senha usados no cadastro.',
      'Depois de entrar, o seu nome aparece no canto superior direito em todas as telas.'
    ],
    observacoes: [
      'A sessão expira em 7 dias. Depois disso é só entrar de novo.',
      'Por segurança o sistema limita tentativas seguidas de login. Se errar muitas vezes, espere alguns minutos.'
    ],
    relacionados: ['criar-conta', 'esqueci-senha'],
    termos: ['login', 'entrar', 'acessar', 'logar', 'conectar', 'nao consigo entrar']
  },
  {
    id: 'notificacoes',
    titulo: 'Notificações do sistema',
    categoria: 'primeiros-passos',
    publicos: ['visitante', 'competidor', 'expositor', 'organizador', 'admin'],
    resumo: 'Avisos de pagamento, aprovação e novidades do evento.',
    passos: [
      'O sino no topo mostra os avisos não lidos.',
      'Clique em um aviso para abri-lo, ou marque todos como lidos de uma vez.'
    ],
    observacoes: [
      'Você recebe notificação quando um pagamento é confirmado e quando a organização analisa a sua inscrição ou solicitação.'
    ],
    relacionados: ['acompanhar-inscricao', 'acompanhar-solicitacao'],
    termos: ['notificacao', 'aviso', 'sino', 'mensagem', 'alerta', 'nao lida']
  },

  // ------------------------------------------------------------- ingressos
  {
    id: 'comprar-ingresso',
    titulo: 'Como comprar um ingresso',
    categoria: 'ingressos',
    publicos: ['visitante'],
    resumo: 'Escolha o lote, pague pelo Mercado Pago e receba o QR code.',
    passos: [
      'Entre na sua conta — a compra exige login.',
      'Abra a página da Geektopia e veja os lotes disponíveis.',
      'Escolha o tipo de ingresso e a quantidade.',
      'Finalize a compra: você é levado ao Mercado Pago.',
      'Pague com Pix, cartão ou boleto.',
      'A confirmação aparece sozinha no seu perfil e os ingressos são gerados automaticamente.'
    ],
    observacoes: [
      'Os ingressos só são emitidos depois que o pagamento é aprovado.',
      'Cada unidade comprada vira um ingresso separado, com QR code próprio.',
      'Lote esgotado aparece marcado e não permite a compra.'
    ],
    relacionados: ['pagamento-nao-confirmou', 'onde-estao-meus-ingressos', 'entrar-no-evento'],
    termos: ['comprar', 'ingresso', 'entrada', 'lote', 'pagar', 'pix', 'cartao', 'bilhete']
  },
  {
    id: 'pagamento-nao-confirmou',
    titulo: 'Paguei, mas o pedido continua pendente',
    categoria: 'ingressos',
    publicos: ['visitante', 'competidor', 'expositor'],
    resumo: 'Existe um botão para forçar a conferência com o Mercado Pago.',
    passos: [
      'Abra "Meus pedidos" no seu perfil.',
      'Localize o pedido e use a opção de sincronizar a situação.',
      'O sistema consulta o Mercado Pago na hora e atualiza o status.'
    ],
    observacoes: [
      'A confirmação normalmente é automática e leva poucos segundos. O botão existe para quando o aviso do Mercado Pago demora.',
      'Boleto pode levar até 3 dias úteis para compensar.',
      'Se mesmo sincronizando continuar pendente, guarde o comprovante e procure a organização.'
    ],
    relacionados: ['comprar-ingresso', 'onde-estao-meus-ingressos'],
    termos: ['pendente', 'nao confirmou', 'paguei', 'pagamento', 'sincronizar', 'demora', 'nao caiu']
  },
  {
    id: 'onde-estao-meus-ingressos',
    titulo: 'Onde ficam os meus ingressos',
    categoria: 'ingressos',
    publicos: ['visitante'],
    resumo: 'Em "Meus ingressos", com QR code e opção de baixar em PDF.',
    passos: [
      'Entre na sua conta e abra "Meus ingressos".',
      'Cada ingresso aparece com o evento, o lote e o QR code.',
      'Você pode baixar o PDF de um ingresso ou de todos os ingressos de um pedido.'
    ],
    observacoes: [
      'Não precisa imprimir: o QR code na tela do celular é suficiente.',
      'Baixar o PDF ajuda se você for a um lugar sem internet.'
    ],
    relacionados: ['entrar-no-evento', 'comprar-ingresso'],
    termos: ['meus ingressos', 'qr code', 'pdf', 'baixar', 'onde esta', 'imprimir']
  },
  {
    id: 'entrar-no-evento',
    titulo: 'Como entrar no evento no dia',
    categoria: 'ingressos',
    publicos: ['visitante'],
    resumo: 'Apresente o QR code na portaria, com documento com foto.',
    passos: [
      'Abra "Meus ingressos" no celular antes de chegar na fila.',
      'Mostre o QR code para a equipe da portaria.',
      'Apresente também um documento com foto.'
    ],
    observacoes: [
      'Cada QR code só pode ser usado uma vez. Depois de validado, o ingresso passa para "utilizado".',
      'Não compartilhe o print do seu ingresso: quem chegar primeiro com aquele código entra no seu lugar.',
      'Confira as regras de idade mínima na página do evento.'
    ],
    relacionados: ['onde-estao-meus-ingressos', 'admin-checkin'],
    termos: ['entrada', 'portaria', 'checkin', 'check-in', 'validar', 'fila', 'documento']
  },

  // ----------------------------------------------------------- competicoes
  {
    id: 'virar-competidor',
    titulo: 'Criar o seu perfil de competidor',
    categoria: 'competicoes',
    publicos: ['visitante', 'competidor'],
    resumo: 'Passo obrigatório antes de se inscrever em qualquer competição.',
    passos: [
      'Entre na sua conta e abra a área de competidor.',
      'Informe o seu apelido de palco, pronomes, modalidade principal e, se tiver, portfólio e redes sociais.',
      'Salve. Agora você pode se inscrever nas competições.'
    ],
    observacoes: [
      'Competidores menores de idade precisam anexar a autorização do responsável.',
      'O apelido de palco pode ser diferente do apelido da sua conta.'
    ],
    relacionados: ['inscrever-competicao', 'editar-perfil'],
    termos: ['competidor', 'perfil de competidor', 'palco', 'cosplayer', 'virar competidor']
  },
  {
    id: 'inscrever-competicao',
    titulo: 'Inscrever-se em uma competição',
    categoria: 'competicoes',
    publicos: ['competidor'],
    resumo: 'Escolha a competição, envie o material e pague a taxa, se houver.',
    passos: [
      'Crie o seu perfil de competidor, se ainda não tiver.',
      'Abra a página da Geektopia e veja as competições da edição.',
      'Escolha a competição e envie os dados pedidos: portfólio de apresentação e link do áudio, quando for o caso.',
      'Se a competição tiver taxa, finalize o pagamento.',
      'A inscrição fica aguardando análise da organização.'
    ],
    observacoes: [
      'Competições em dupla ou grupo exigem uma equipe. A pessoa líder cria a equipe e inscreve as demais.',
      'Dois competidores não podem usar o mesmo apelido de palco na mesma edição do evento.',
      'Você acompanha o resultado em "Minhas inscrições" e recebe notificação quando a análise sair.'
    ],
    relacionados: ['virar-competidor', 'acompanhar-inscricao', 'pagamento-nao-confirmou'],
    termos: ['inscricao', 'inscrever', 'competicao', 'concurso', 'cosplay', 'kpop', 'k-pop', 'just dance', 'participar']
  },
  {
    id: 'acompanhar-inscricao',
    titulo: 'Acompanhar ou cancelar a sua inscrição',
    categoria: 'competicoes',
    publicos: ['competidor'],
    resumo: 'Em "Minhas inscrições", com o status e a justificativa da análise.',
    passos: [
      'Abra "Minhas inscrições" no seu perfil.',
      'Veja a situação de cada uma: aguardando pagamento, em análise, aprovada ou reprovada.',
      'Enquanto estiver em análise, você ainda pode corrigir os dados ou cancelar.'
    ],
    observacoes: [
      'Ao analisar, a organização pode deixar uma justificativa — ela aparece junto do resultado.',
      'Depois de aprovada ou reprovada, a inscrição não é mais editável. Fale com a organização se precisar mudar algo.'
    ],
    relacionados: ['inscrever-competicao', 'notificacoes'],
    termos: ['minhas inscricoes', 'status', 'aprovado', 'reprovado', 'cancelar inscricao', 'acompanhar']
  },

  // ----------------------------------------------------------- expositores
  {
    id: 'virar-expositor',
    titulo: 'Criar o seu perfil de expositor',
    categoria: 'expositores',
    publicos: ['visitante', 'expositor'],
    resumo: 'Passo obrigatório antes de solicitar um espaço.',
    passos: [
      'Entre na sua conta e abra a área de expositor.',
      'Informe o nome da loja ou projeto, o tipo de exposição e, se tiver, o portfólio.',
      'Envie a logo, se quiser que ela apareça na vitrine de expositores.',
      'Salve.'
    ],
    observacoes: [
      'O seu perfil de expositor passa por aprovação da organização antes de aparecer publicamente.'
    ],
    relacionados: ['solicitar-espaco', 'acompanhar-solicitacao'],
    termos: ['expositor', 'lojista', 'estande', 'banca', 'vender', 'artista', 'virar expositor']
  },
  {
    id: 'solicitar-espaco',
    titulo: 'Solicitar um espaço no evento',
    categoria: 'expositores',
    publicos: ['expositor'],
    resumo: 'Escolha o tipo de estande, some os extras e envie para análise.',
    passos: [
      'Crie o seu perfil de expositor, se ainda não tiver.',
      'Veja o catálogo de espaços: cada tipo mostra tamanho, mesas, cadeiras, credenciais inclusas e valor.',
      'Escolha o tipo e informe quantos ajudantes, mesas e cadeiras extras você precisa.',
      'O sistema calcula o total na hora.',
      'Envie. A solicitação fica em análise pela organização.'
    ],
    observacoes: [
      'Os valores ficam travados no momento do pedido. Se a tabela mudar depois, o seu pedido mantém o preço combinado.',
      'Você só pode ter uma solicitação ativa por edição do evento.',
      'As credenciais inclusas definem quantas pessoas entram sem pagar ingresso. Acima disso, cada ajudante tem taxa.'
    ],
    relacionados: ['virar-expositor', 'acompanhar-solicitacao'],
    termos: ['espaco', 'estande', 'barraca', 'solicitar', 'reservar', 'mesa', 'cadeira', 'ajudante', 'metragem']
  },
  {
    id: 'acompanhar-solicitacao',
    titulo: 'Acompanhar a sua solicitação de espaço',
    categoria: 'expositores',
    publicos: ['expositor'],
    resumo: 'Em análise, aprovada ou reprovada — com o valor final.',
    passos: [
      'Abra "Minhas solicitações" no seu perfil.',
      'Veja a situação e o valor total calculado.',
      'Enquanto estiver em análise, você ainda pode ajustar os extras ou cancelar.'
    ],
    observacoes: [
      'Depois de analisada, a solicitação não é mais editável por você.',
      'Se já houver um pagamento gerado, o cancelamento passa pela organização.'
    ],
    relacionados: ['solicitar-espaco', 'notificacoes'],
    termos: ['minhas solicitacoes', 'aprovacao', 'status do espaco', 'cancelar espaco']
  },

  // ------------------------------------------------------------ comunidade
  {
    id: 'divulgar-evento',
    titulo: 'Divulgar um evento da comunidade',
    categoria: 'comunidade',
    publicos: ['visitante', 'organizador'],
    resumo: 'Submeta o seu evento geek para o calendário do CCPOP.',
    passos: [
      'Entre na sua conta.',
      'Abra a área de eventos da comunidade e envie a proposta: nome, data, local, descrição e link.',
      'A organização analisa e, se aprovar, publica no calendário do portal.'
    ],
    observacoes: [
      'O CCPOP apenas divulga: ingressos e inscrições do seu evento continuam por sua conta.',
      'Enquanto não for publicado, você pode editar ou retirar a proposta.'
    ],
    relacionados: ['notificacoes'],
    termos: ['divulgar', 'evento da comunidade', 'calendario', 'parceiro', 'submeter evento', 'terceiros']
  },

  // ------------------------------------------------------ conta/privacidade
  {
    id: 'editar-perfil',
    titulo: 'Editar os seus dados e a foto de perfil',
    categoria: 'conta',
    publicos: ['visitante', 'competidor', 'expositor', 'organizador'],
    resumo: 'Nome, telefone, cidade, apelido e avatar.',
    passos: [
      'Entre na sua conta e abra o seu perfil.',
      'Altere o que precisar e salve. Você pode mudar só um campo — o resto continua como estava.',
      'Para a foto, use o botão de envio de imagem no topo do perfil.'
    ],
    observacoes: [
      'O apelido (nickname) é único no sistema inteiro. Se o que você quer já estiver em uso, escolha outro.',
      'O e-mail da conta não é alterado por aqui. Fale com a organização se precisar trocar.'
    ],
    relacionados: ['trocar-senha', 'encerrar-conta', 'virar-competidor'],
    termos: ['perfil', 'editar', 'foto', 'avatar', 'apelido', 'nickname', 'dados']
  },
  {
    id: 'trocar-senha',
    titulo: 'Trocar a sua senha',
    categoria: 'conta',
    publicos: ['visitante', 'competidor', 'expositor', 'organizador', 'admin'],
    resumo: 'Precisa da senha atual para confirmar.',
    passos: [
      'Abra o seu perfil e procure a opção de alterar senha.',
      'Informe a senha atual e depois a nova.',
      'Salve. Você continua logado normalmente.'
    ],
    observacoes: [
      'Se você não lembra a senha atual, use a recuperação por e-mail em vez desta tela.'
    ],
    relacionados: ['esqueci-senha', 'editar-perfil'],
    termos: ['senha', 'trocar senha', 'alterar senha', 'mudar senha', 'password']
  },
  {
    id: 'esqueci-senha',
    titulo: 'Esqueci a minha senha',
    categoria: 'conta',
    publicos: ['visitante', 'competidor', 'expositor', 'organizador', 'admin'],
    resumo: 'Recuperação por link enviado para o e-mail cadastrado.',
    passos: [
      'Na tela de entrada, clique em "Esqueci a minha senha".',
      'Informe o e-mail usado no cadastro.',
      'Abra o link que chegou no e-mail e defina a nova senha.'
    ],
    observacoes: [
      'Por segurança, a mensagem na tela é sempre a mesma, exista ou não conta com aquele e-mail.',
      'O link vale por tempo limitado e só pode ser usado uma vez. Se expirar, peça outro.',
      'Confira a caixa de spam antes de pedir um segundo link.'
    ],
    relacionados: ['trocar-senha', 'entrar-na-conta'],
    termos: ['esqueci', 'recuperar senha', 'redefinir', 'reset', 'perdi a senha']
  },
  {
    id: 'encerrar-conta',
    titulo: 'Encerrar a minha conta',
    categoria: 'conta',
    publicos: ['visitante', 'competidor', 'expositor', 'organizador'],
    resumo: 'Conta sem histórico pode ser apagada; conta com histórico é mantida.',
    passos: [
      'Peça à organização do CCPOP o encerramento da sua conta.',
      'Se a conta não tiver nenhuma atividade, ela é apagada.'
    ],
    observacoes: [
      'Se você já comprou ingresso, se inscreveu em competição, enviou avaliação ou pediu espaço, a conta não é apagada. Isso preserva o histórico financeiro e a lista de presença, que a organização precisa manter.',
      'Nesse caso o sistema mostra exatamente o que está vinculado à conta, e a organização combina com você o que fazer.'
    ],
    relacionados: ['editar-perfil'],
    termos: ['excluir conta', 'apagar conta', 'encerrar', 'deletar', 'cancelar cadastro']
  },

  // ---------------------------------------------------------- administracao
  {
    id: 'admin-criar-edicao',
    titulo: 'Criar uma edição da Geektopia',
    categoria: 'administracao',
    publicos: ['admin'],
    resumo: 'A edição nasce como rascunho e só aparece quando você publica.',
    passos: [
      'No painel, abra a gestão de edições e crie uma nova.',
      'Informe nome, datas, local, descrição e regras de idade.',
      'A edição nasce com status "Bloqueado": existe só para a equipe.',
      'Monte os lotes, a programação e as competições.',
      'Quando estiver pronta, mude o status para "Vendas abertas".'
    ],
    observacoes: [
      'Edição em rascunho é invisível ao público, inclusive por link direto.',
      'O sistema não deixa abrir as vendas sem pelo menos um lote cadastrado — evita a vitrine vazia.',
      'Os quatro status são: Bloqueado, Vendas abertas, Vendas encerradas e Encerrado.'
    ],
    relacionados: ['admin-lotes', 'admin-analisar'],
    termos: ['criar edicao', 'nova geektopia', 'publicar evento', 'abrir vendas', 'rascunho', 'status']
  },
  {
    id: 'admin-lotes',
    titulo: 'Cadastrar lotes de ingresso',
    categoria: 'administracao',
    publicos: ['admin'],
    resumo: 'Cada lote é um tipo de ingresso com preço e quantidade.',
    passos: [
      'Dentro da edição, abra a gestão de lotes.',
      'Crie o lote com nome, valor e quantidade disponível.',
      'Repita para cada tipo: Sábado, Domingo, Combo, meia-entrada.'
    ],
    observacoes: [
      'Preço e quantidade precisam ser maiores que zero.',
      'Não é possível reduzir a quantidade para menos do que já foi vendido.',
      'Lote com ingresso emitido não pode ser excluído — isso apagaria histórico. Para parar de vender, encerre as vendas da edição.'
    ],
    relacionados: ['admin-criar-edicao', 'admin-relatorios'],
    termos: ['lote', 'preco', 'estoque', 'quantidade', 'meia entrada']
  },
  {
    id: 'admin-analisar',
    titulo: 'Analisar inscrições, expositores e eventos',
    categoria: 'administracao',
    publicos: ['admin'],
    resumo: 'As filas de análise ficam no painel, separadas por tipo.',
    passos: [
      'No painel, abra a fila que quiser: competidores, expositores ou eventos da comunidade.',
      'Filtre por situação para ver só o que está em análise.',
      'Abra o item, confira os dados enviados e aprove ou reprove.',
      'Ao reprovar, escreva a justificativa — ela aparece para a pessoa.'
    ],
    observacoes: [
      'A pessoa recebe notificação assim que você decide.',
      'Depois de analisado, o item não é mais editável por quem enviou.'
    ],
    relacionados: ['admin-criar-edicao', 'admin-checkin'],
    termos: ['analisar', 'aprovar', 'reprovar', 'fila', 'curadoria', 'moderar', 'justificativa']
  },
  {
    id: 'admin-checkin',
    titulo: 'Fazer o check-in na portaria',
    categoria: 'administracao',
    publicos: ['admin'],
    resumo: 'Leia o QR code do visitante e valide a entrada.',
    passos: [
      'Abra a tela de check-in no painel.',
      'Leia o QR code do ingresso com a câmera.',
      'O sistema confirma se o ingresso é válido e registra a entrada.'
    ],
    observacoes: [
      'Um ingresso só pode ser validado uma vez. Na segunda tentativa, o sistema avisa que já foi utilizado.',
      'Confira o documento com foto do visitante antes de liberar.',
      'Se a leitura falhar, dá para buscar o ingresso pelo código.'
    ],
    relacionados: ['entrar-no-evento', 'admin-relatorios'],
    termos: ['checkin', 'check-in', 'portaria', 'validar ingresso', 'qr', 'leitor', 'entrada']
  },
  {
    id: 'admin-relatorios',
    titulo: 'Relatórios e painel demográfico',
    categoria: 'administracao',
    publicos: ['admin'],
    resumo: 'Vendas por lote, público por faixa etária, cidade e taxa de check-in.',
    passos: [
      'No painel, abra a área de relatórios.',
      'Escolha a edição do evento.',
      'Os gráficos são montados a partir dos dados dos cadastros e das vendas.'
    ],
    observacoes: [
      'Estes números servem para prestação de contas e para editais de incentivo à cultura.',
      'Os dados são agregados: o relatório mostra totais, não pessoas identificadas.'
    ],
    relacionados: ['admin-lotes', 'admin-checkin'],
    termos: ['relatorio', 'dashboard', 'grafico', 'demografico', 'vendas', 'publico', 'estatistica']
  },
  {
    id: 'admin-conteudo',
    titulo: 'Editar os textos do site',
    categoria: 'administracao',
    publicos: ['admin'],
    resumo: 'A landing page e a página da Geektopia são editáveis pelo painel.',
    passos: [
      'No painel, abra a edição de conteúdo.',
      'Altere títulos, textos e números da página inicial.',
      'Salve. A mudança aparece no site na hora.'
    ],
    observacoes: [
      'Existe a opção de restaurar o texto padrão: ela apaga a personalização e volta ao original.'
    ],
    relacionados: ['admin-criar-edicao'],
    termos: ['conteudo', 'texto do site', 'landing', 'editar pagina', 'home', 'personalizar']
  },
  {
    id: 'admin-usuarios',
    titulo: 'Gerenciar usuários e administradores',
    categoria: 'administracao',
    publicos: ['admin'],
    resumo: 'Consultar contas, dar ou remover o acesso de administrador, inativar e excluir.',
    passos: [
      'No painel, abra a gestão de usuários.',
      'Busque a pessoa e abra o cadastro.',
      'Use as ações de dar acesso de administrador, remover esse acesso, inativar ou excluir.'
    ],
    observacoes: [
      'Contas com histórico de compra, inscrição, avaliação ou pedido de espaço não podem ser excluídas: o sistema recusa e mostra o que está vinculado, para preservar o registro do evento.',
      'Quem perde o acesso de administrador deixa de ver o painel na hora. Quem recebe o acesso precisa sair e entrar de novo para o painel aparecer.',
      'Você não pode excluir, inativar nem remover o acesso da sua própria conta por esta tela — é uma trava contra o sistema ficar sem administrador.'
    ],
    relacionados: ['encerrar-conta', 'admin-analisar'],
    termos: ['usuarios', 'administrador', 'promover', 'rebaixar', 'remover acesso', 'inativar', 'excluir', 'desativar', 'permissao', 'conselheiro']
  }
];

module.exports = { PUBLICOS, CATEGORIAS, ARTIGOS };
