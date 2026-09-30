/**
 * Tipos das entidades do modelo de dados conceitual (Seção 6 do design).
 *
 * Este módulo é só declaração de tipo: nenhuma regra de migração vive aqui.
 * O conteúdo decisório — critérios, valores, perguntas, estratégias, regras e
 * estudos — é dado editável em `src/conteudo/*.json` (Requisito 5.1), por isso
 * os identificadores são `string` livre: acrescentar uma estratégia ou um
 * estudo não exige alterar código.
 */

/** Identificador de um item do conteúdo, na forma usada nos arquivos JSON. */
export type Id = string;

/** Identificador de estudo na forma `[Autor+Ano]`, ex.: `[Ramchand2021]`. */
export type IdEstudo = string;

// ---------------------------------------------------------------------------
// Critérios e valores de resposta
// ---------------------------------------------------------------------------

/**
 * Valor de resposta admissível de um critério.
 *
 * "Não sei" NÃO é cadastrado: é implícito em todo critério e representado por
 * {@link RespostaDesconhecida} no momento do registro (Requisito 3.1).
 */
export interface ValorDeResposta {
  id: Id;
  /** Critério a que o valor pertence. */
  criterio: Id;
  /** Rótulo apresentado ao usuário. */
  rotulo: string;
}

/**
 * Propriedade do cenário sobre a qual o Guia pergunta.
 *
 * Os valores admissíveis não precisam ser mutuamente exclusivos nem
 * coletivamente exaustivos ([Mwilu2024], Requisito 5.4) — o mecanismo não
 * assume cobertura completa, e `permiteRespostaMultipla` declara quando mais de
 * um valor pode ser escolhido na mesma resposta.
 */
export interface Criterio {
  id: Id;
  nome: string;
  descricao: string;
  valores: ValorDeResposta[];
  permiteRespostaMultipla: boolean;
}

// ---------------------------------------------------------------------------
// Condições
// ---------------------------------------------------------------------------

/** Par critério–valor, unidade elementar de uma condição. */
export interface ParCriterioValor {
  criterio: Id;
  valor: Id;
}

/**
 * Conjunção de pares critério–valor.
 *
 * Condição composta — valor de negócio alto E qualidade técnica ruim — é uma
 * única condição, e portanto uma única regra (Seção 6 do design).
 * `descricao` é o texto legível exibido como "a condição satisfeita"
 * (Requisito 2.2).
 */
export interface Condicao {
  pares: ParCriterioValor[];
  descricao: string;
}

/**
 * Condição de exibição de uma pergunta.
 *
 * Duas partes, ambas opcionais: uma expressão sobre respostas já registradas e
 * a exigência de que certas estratégias ainda estejam em jogo. A segunda é o
 * que sustenta o Bloco F, apresentado só quando Replatform com alvo PaaS
 * continua viável (Seção 4.2 do design). Pergunta sem condição de exibição é
 * sempre aplicável.
 */
export interface CondicaoDeExibicao {
  respostas?: Condicao;
  /** Estratégias que precisam não estar fixadas para a pergunta aparecer. */
  estrategiasEmJogo?: Id[];
}

// ---------------------------------------------------------------------------
// Perguntas
// ---------------------------------------------------------------------------

/** Bloco do fluxo do questionário (Seção 4 do design). */
export type Bloco = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/**
 * Pergunta apresentada ao usuário, uma por vez.
 *
 * O texto usa linguagem de negócio, não o vocabulário dos artigos (decisão de
 * projeto da Seção 3.1 do design). `estrategiasAfetadas` é o que permite
 * retirar a pergunta de circulação quando todas as estratégias da sua coluna já
 * estão fixadas (Requisito 1.4).
 */
export interface Pergunta {
  id: Id;
  texto: string;
  /** Critério investigado. */
  criterio: Id;
  bloco: Bloco;
  /** Ordem dentro do bloco. */
  ordem: number;
  condicaoDeExibicao?: CondicaoDeExibicao;
  estrategiasAfetadas: Id[];
  fontes: IdEstudo[];
}

// ---------------------------------------------------------------------------
// Estratégias
// ---------------------------------------------------------------------------

/**
 * Estratégia de migração dos 7Rs.
 *
 * `temCaracterizacaoNoCorpus` é falso para Repurchase e Relocate, que entram
 * por decisão do projeto sem caracterização nos estudos (Seção 6.1 dos
 * requisitos).
 */
export interface Estrategia {
  id: Id;
  nome: string;
  descricao: string;
  temCaracterizacaoNoCorpus: boolean;
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

/**
 * Tipo de efeito de uma regra (Seção 5.1 do design).
 *
 * - `precondicao`: a literatura declara verificação obrigatória ou
 *   incompatibilidade. Falha fixa a estratégia em "não recomendada".
 * - `contribuicao`: empurra a estratégia a favor ou contra; o conjunto das
 *   contribuições define a posição final.
 */
export type TipoDeEfeito = 'precondicao' | 'contribuicao';

/** Direção do efeito de uma regra sobre a estratégia alvo. */
export type DirecaoDeEfeito = 'favor' | 'contra';

/**
 * Regra: liga uma condição sobre as respostas a um efeito sobre uma estratégia,
 * com fonte e marcações.
 *
 * `estudosDeOrigem` é lista porque várias regras da Seção 4.6 dos requisitos se
 * sustentam em mais de um estudo — débito técnico elevado com alto valor de
 * negócio vem de [Kirkila2025] e [Fonseca2024].
 */
export interface Regra {
  id: Id;
  condicao: Condicao;
  estrategiaAlvo: Id;
  tipoDeEfeito: TipoDeEfeito;
  direcao: DirecaoDeEfeito;
  /** Motivo em linguagem de negócio, exibido junto à posição da estratégia. */
  textoMotivo: string;
  /** Referência do estudo que sustenta a regra (Requisito 5.3). */
  estudosDeOrigem: IdEstudo[];
  /**
   * A correspondência entre o texto do estudo e o vocabulário dos 7Rs é
   * interpretação da pesquisadora (Requisito 2.5).
   */
  ehInterpretacao: boolean;
  /**
   * A evidência vem apenas de organizações com 250 funcionários ou mais
   * (Requisito 4.5).
   */
  evidenciaApenasDePorteGrande: boolean;
}

// ---------------------------------------------------------------------------
// Estudos
// ---------------------------------------------------------------------------

/** Estudo primário do corpus, espelhando a Seção 7 dos requisitos. */
export interface Estudo {
  /** Identificador na forma `[Autor+Ano]`. */
  id: IdEstudo;
  referencia: string;
  /** Caminho do arquivo no acervo, ou `null` quando ausente (Seção 6.2). */
  arquivoNoAcervo: string | null;
  contextoEmpirico: string;
  porteAnalisado: string;
}

// ---------------------------------------------------------------------------
// Avisos de encerramento
// ---------------------------------------------------------------------------

/**
 * Os três avisos de encerramento (Seção 5.6 do design; Requisitos 4.2 a 4.4).
 *
 * As **declarações** são fixas e ficam na interface, pelo mesmo motivo que a
 * declaração de ausência de distinção fica no mecanismo: não vêm da literatura,
 * são o que o Guia diz sobre si mesmo. O que vem da literatura são as **listas**
 * que acompanham dois deles — fatores de sucesso e de fracasso de
 * [Kirkila2025], condutores de custo de [Dalakas2025] e custos ocultos de
 * [Ramchand2021] —, e essas são conteúdo editável.
 *
 * Este tipo é o vocabulário que liga uma lista cadastrada ao aviso sob o qual
 * ela aparece, do mesmo modo que {@link Bloco} liga uma pergunta ao seu bloco.
 */
export type AvisoDeEncerramento =
  /** A saída é apoio à decisão e não substitui avaliação especializada (4.2). */
  | 'apoioADecisao'
  /** A saída não constitui plano de execução (4.3). */
  | 'semPlanoDeExecucao'
  /** A saída não contém estimativa de custo monetário (4.4). */
  | 'semEstimativaDeCusto';

/**
 * Item de uma lista de aviso: um fator, um condutor de custo ou um custo
 * oculto, com o estudo que o registra.
 *
 * `estrategias` é o que permite filtrar a lista pelas estratégias efetivamente
 * recomendadas na sessão (decisão de projeto da Seção 5.6 do design). Lista
 * vazia significa item que não depende da estratégia escolhida e por isso
 * aparece em toda sessão — planejamento deficiente é risco de qualquer caminho,
 * incompatibilidade de plataforma não.
 *
 * A associação entre item e estratégia é leitura da pesquisadora: os estudos
 * apresentam os fatores e os custos como propriedades do processo de migração,
 * sem atribuí-los às estratégias dos 7Rs. O texto de cada lista declara isso ao
 * usuário.
 */
export interface ItemDeAviso {
  id: Id;
  texto: string;
  estudosDeOrigem: IdEstudo[];
  /** Estratégias a que o item se aplica; vazio quando se aplica a todas. */
  estrategias: Id[];
}

/** Lista de itens exibida sob um dos três avisos de encerramento. */
export interface ListaDeAviso {
  id: Id;
  /** Aviso sob o qual a lista aparece. */
  aviso: AvisoDeEncerramento;
  titulo: string;
  descricao: string;
  itens: ItemDeAviso[];
}

// ---------------------------------------------------------------------------
// Conteúdo editável
// ---------------------------------------------------------------------------

/**
 * Todo o conteúdo editável, lido no início da sessão (Seção 2.1 do design).
 * Alteração de conteúdo vale para as sessões iniciadas depois (Requisito 5.2).
 */
export interface Conteudo {
  criterios: Criterio[];
  perguntas: Pergunta[];
  estrategias: Estrategia[];
  regras: Regra[];
  estudos: Estudo[];
  /**
   * Listas que acompanham os avisos de encerramento (Requisitos 4.3 e 4.4).
   *
   * Opcional porque não participa da inferência: conteúdo montado para
   * exercitar o motor de regras ou a seleção de perguntas não precisa
   * declará-la, e a ausência apenas deixa os avisos sem listas — as três
   * declarações são fixas e não dependem do conteúdo. `carregarConteudo`
   * sempre a traz, e `conteudo.test.ts` confere que o repositório cadastra as
   * listas que os Requisitos 4.3 e 4.4 exigem.
   */
  listasDeAviso?: ListaDeAviso[];
}

// ---------------------------------------------------------------------------
// Sessão e respostas
// ---------------------------------------------------------------------------

/** Um ou mais valores cadastrados escolhidos para o critério. */
export interface ValoresEscolhidos {
  tipo: 'valores';
  /** Lista com mais de um item só quando `permiteRespostaMultipla` é verdadeiro. */
  valores: Id[];
}

/**
 * "Não sei": valor implícito de todo critério, não cadastrado no conteúdo.
 * Desliga as regras que dependem do critério sem descartar estratégia alguma
 * (Requisito 3.3).
 */
export interface RespostaDesconhecida {
  tipo: 'desconhecida';
}

/** Valor registrado para um critério: valores cadastrados ou "não sei". */
export type ValorRegistrado = ValoresEscolhidos | RespostaDesconhecida;

/**
 * Resposta registrada na sessão. Substituída em caso de revisão
 * (Requisito 1.5).
 */
export interface Resposta {
  criterio: Id;
  valor: ValorRegistrado;
  /** Momento do registro, em ISO 8601. */
  momento: string;
}

/**
 * Sessão de avaliação de uma aplicação. Carrega o conteúdo vigente no início e
 * acumula as respostas registradas e os critérios sem resposta.
 */
export interface Sessao {
  id: Id;
  /** Início da sessão, em ISO 8601. */
  inicio: string;
  conteudo: Conteudo;
  respostas: Resposta[];
  /** Critérios respondidos como desconhecidos (Requisito 3.4). */
  criteriosSemResposta: Id[];
}

// ---------------------------------------------------------------------------
// Posição de estratégia
// ---------------------------------------------------------------------------

/** Faixa em que a estratégia é apresentada (Seção 5.2 do design). */
export type Faixa = 'recomendada' | 'possivel' | 'naoRecomendada';

/**
 * Regra que se aplicou na sessão, com o rastro que a justifica: a condição
 * satisfeita, as respostas que a satisfizeram e as referências dos estudos
 * (Requisitos 2.2 e 2.3).
 */
export interface RegraAcionada {
  regra: Id;
  condicaoSatisfeita: Condicao;
  respostasQueSatisfizeram: Resposta[];
  textoMotivo: string;
  estudosDeOrigem: IdEstudo[];
}

/**
 * Posição de uma estratégia na sessão, recalculada a cada resposta registrada
 * ou revisada.
 *
 * `saldo` é interno: a justificativa exibida é a lista de regras, não o número
 * (Seção 5.2 do design). `evidenciaDividida` distingue "possível porque a
 * literatura falou e discordou" de "possível porque nenhuma regra se aplicou"
 * (Seção 5.3).
 */
export interface PosicaoDeEstrategia {
  estrategia: Id;
  faixa: Faixa;
  saldo: number;
  regrasAFavor: RegraAcionada[];
  regrasContra: RegraAcionada[];
  /** Precondições cuja condição de incompatibilidade se verificou. */
  precondicoesFalhadas: RegraAcionada[];
  evidenciaDividida: boolean;
  nenhumaRegraAplicada: boolean;
  /** Alguma regra acionada carrega marcação de interpretação (Requisito 2.5). */
  temMarcacaoDeInterpretacao: boolean;
  /** Alguma regra acionada carrega marcação de porte (Requisito 4.5). */
  temMarcacaoDePorte: boolean;
}

/**
 * Estratégia que nenhuma regra do conteúdo menciona: não é pontuada nem
 * colocada nas três faixas (Seção 5.4 do design). O grupo desaparece quando o
 * conteúdo passa a ter regra para a estratégia.
 */
export interface EstrategiaNaoAvaliada {
  estrategia: Id;
  razao: string;
}
