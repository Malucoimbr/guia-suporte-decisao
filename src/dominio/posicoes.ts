/**
 * Cálculo da posição de cada estratégia (Seção 5 do design; Requisitos 2.1 a
 * 2.5, 3.3 e 4.5).
 *
 * `condicoes.ts` responde se uma condição vale diante das respostas
 * registradas. Esta é a camada seguinte: reunir, para cada estratégia, as
 * regras que se aplicaram e transformá-las em faixa — recomendada, possível ou
 * não recomendada — com o rastro que a justifica.
 *
 * Três coisas definem o comportamento e nenhuma delas é escolha livre:
 *
 * - **Precondição falhada fixa a estratégia.** Onde a literatura declara
 *   verificação obrigatória ou incompatibilidade — as verificações de PaaS que
 *   [Khouibiri2024] chama de obrigatórias e a incompatibilidade regulatória de
 *   [Ramchand2021] —, a falha manda a estratégia para "não recomendada" e
 *   nenhuma soma de contribuições a tira de lá (Seção 5.1 do design).
 * - **Precondição indeterminada não elimina.** Critério respondido como "não
 *   sei" ou ainda sem resposta deixa a precondição em aberto, e a estratégia
 *   permanece disponível (Requisito 3.3, Seção 4.3 do design). É a preservação
 *   conservadora declarada nos requisitos, e é o motivo pelo qual
 *   `avaliarCondicao` tem três estados em vez de dois.
 * - **O saldo decide a faixa, mas não é a justificativa.** Cada contribuição a
 *   favor vale +1 e cada contribuição contra vale −1, sem pesos diferenciados
 *   porque o corpus não fornece base para diferenciá-los (Seção 5.2). O saldo é
 *   interno: o que se exibe é a lista de regras acionadas, cada uma com a
 *   condição satisfeita, as respostas que a satisfizeram e a referência do
 *   estudo (Requisitos 2.2 e 2.3).
 *
 * O conflito entre regras não é escondido nem resolvido: a estratégia fica na
 * faixa que o saldo indica e recebe `evidenciaDividida`, que é o que distingue
 * "possível porque a literatura falou e discordou" de "possível porque nenhuma
 * regra se aplicou" (Seção 5.3).
 *
 * Funções puras, sem leitura de arquivo e sem estado: as mesmas respostas
 * contra o mesmo conteúdo devolvem sempre a mesma posição.
 */
import { avaliarCondicao, indexarRespostasPorCriterio } from './condicoes';
import type {
  Conteudo,
  EstrategiaNaoAvaliada,
  Faixa,
  Id,
  PosicaoDeEstrategia,
  Regra,
  RegraAcionada,
  Resposta,
} from './tipos';

/** Respostas da sessão, cruas ou já indexadas por critério. */
export type RespostasDaSessao = readonly Resposta[] | ReadonlyMap<Id, Resposta>;

/**
 * Ordem de apresentação das faixas no resultado (Seção 5.5 do design).
 * Dentro de cada faixa, saldo decrescente.
 */
const ORDEM_DAS_FAIXAS: Readonly<Record<Faixa, number>> = {
  recomendada: 0,
  possivel: 1,
  naoRecomendada: 2,
};

/**
 * A estratégia está fixada em "não recomendada"?
 *
 * Fixada significa eliminada por precondição: pontos não a tiram de lá. É o que
 * permite retirar de circulação a pergunta cujas estratégias afetadas já estão
 * todas fixadas (Seção 4.2 do design, Requisito 1.4) e o que sustenta a
 * condição de exibição do Bloco F.
 */
export function estrategiaFixada(posicao: PosicaoDeEstrategia): boolean {
  return posicao.precondicoesFalhadas.length > 0;
}

/**
 * Calcula a posição de uma estratégia diante das respostas registradas.
 *
 * `regras` pode ser o conjunto inteiro do conteúdo: só as que apontam para esta
 * estratégia são consideradas.
 */
export function calcularPosicaoDeEstrategia(
  estrategia: Id,
  regras: readonly Regra[],
  respostas: RespostasDaSessao,
): PosicaoDeEstrategia {
  const porCriterio =
    respostas instanceof Map
      ? (respostas as ReadonlyMap<Id, Resposta>)
      : indexarRespostasPorCriterio(respostas as readonly Resposta[]);

  const regrasAFavor: RegraAcionada[] = [];
  const regrasContra: RegraAcionada[] = [];
  const precondicoesFalhadas: RegraAcionada[] = [];
  let temMarcacaoDeInterpretacao = false;
  let temMarcacaoDePorte = false;

  /** Registra as marcações da regra que acabou de ser acionada. */
  const propagarMarcacoes = (regra: Regra) => {
    temMarcacaoDeInterpretacao = temMarcacaoDeInterpretacao || regra.ehInterpretacao;
    temMarcacaoDePorte = temMarcacaoDePorte || regra.evidenciaApenasDePorteGrande;
  };

  for (const regra of regras) {
    if (regra.estrategiaAlvo !== estrategia) continue;

    const avaliacao = avaliarCondicao(regra.condicao, porCriterio);

    // Indeterminada nunca aciona nada: "não sei" e critério ainda sem resposta
    // desligam a regra sem descartar a estratégia (Requisito 3.3).
    if (avaliacao.resultado === 'indeterminada') continue;

    if (regra.tipoDeEfeito === 'precondicao') {
      // A precondição pode estar redigida em qualquer das duas polaridades, e o
      // conteúdo é editável: `contra` descreve a incompatibilidade que elimina a
      // estratégia — "existe componente regulado", "o banco não tem equivalente"
      // —, `favor` descreve a verificação que precisa passar — "a linguagem é
      // suportada". A primeira falha quando a condição se verifica; a segunda,
      // quando uma resposta registrada a contradiz. Nos dois casos a falha exige
      // informação registrada, nunca ausência dela.
      const falhou =
        regra.direcao === 'contra'
          ? avaliacao.resultado === 'satisfeita'
          : avaliacao.resultado === 'naoSatisfeita';

      if (falhou) {
        precondicoesFalhadas.push({
          regra: regra.id,
          condicaoSatisfeita: regra.condicao,
          // Motivo do descarte (Requisito 2.4): quando a condição se verificou,
          // são as respostas que a satisfizeram; quando ela foi contradita, são
          // as respostas que a contradisseram.
          respostasQueSatisfizeram:
            avaliacao.resultado === 'satisfeita'
              ? avaliacao.respostasQueSatisfizeram
              : respostasDosPares(avaliacao.paresNaoSatisfeitos, porCriterio),
          textoMotivo: regra.textoMotivo,
          estudosDeOrigem: regra.estudosDeOrigem,
        });
        propagarMarcacoes(regra);
      }
      // Precondição que passou não soma ponto: verificação obrigatória cumprida
      // não é evidência a favor da estratégia (Seção 5.1 do design).
      continue;
    }

    if (avaliacao.resultado !== 'satisfeita') continue;

    const acionada: RegraAcionada = {
      regra: regra.id,
      condicaoSatisfeita: regra.condicao,
      respostasQueSatisfizeram: avaliacao.respostasQueSatisfizeram,
      textoMotivo: regra.textoMotivo,
      estudosDeOrigem: regra.estudosDeOrigem,
    };
    if (regra.direcao === 'favor') {
      regrasAFavor.push(acionada);
    } else {
      regrasContra.push(acionada);
    }
    propagarMarcacoes(regra);
  }

  const saldo = regrasAFavor.length - regrasContra.length;

  return {
    estrategia,
    faixa: faixaDe(saldo, precondicoesFalhadas.length > 0),
    saldo,
    regrasAFavor,
    regrasContra,
    precondicoesFalhadas,
    // A literatura falou e discordou: as duas listas ficam visíveis e o conflito
    // não é resolvido (Seção 5.3 do design).
    evidenciaDividida: regrasAFavor.length > 0 && regrasContra.length > 0,
    // A literatura não falou: nenhuma regra cadastrada para a estratégia se
    // aplicou a este cenário. Diferente de não haver regra cadastrada, que é o
    // grupo "não avaliada pelo Guia" (Seção 5.4).
    nenhumaRegraAplicada:
      regrasAFavor.length === 0 && regrasContra.length === 0 && precondicoesFalhadas.length === 0,
    temMarcacaoDeInterpretacao,
    temMarcacaoDePorte,
  };
}

/**
 * Calcula a posição de todas as estratégias que o conteúdo tem regra para
 * avaliar, ordenadas para apresentação: recomendadas primeiro, por saldo
 * decrescente, depois possíveis e não recomendadas.
 *
 * Estratégia que nenhuma regra do conteúdo menciona — hoje Relocate — não é
 * pontuada nem colocada nas três faixas, e por isso não aparece aqui: pertence
 * ao grupo "não avaliada pelo Guia" da Seção 5.4 do design, montado à parte. O
 * grupo desaparece sozinho quando o conteúdo passa a ter regra para ela, sem
 * alteração deste módulo.
 */
export function calcularPosicoes(
  conteudo: Conteudo,
  respostas: RespostasDaSessao,
): PosicaoDeEstrategia[] {
  const porCriterio =
    respostas instanceof Map
      ? (respostas as ReadonlyMap<Id, Resposta>)
      : indexarRespostasPorCriterio(respostas as readonly Resposta[]);

  const comRegra = estrategiasComRegra(conteudo.regras);

  return conteudo.estrategias
    .filter((estrategia) => comRegra.has(estrategia.id))
    .map((estrategia) => calcularPosicaoDeEstrategia(estrategia.id, conteudo.regras, porCriterio))
    .sort(compararPosicoes);
}

/**
 * Razão pela qual a estratégia não é avaliada (Seção 5.4 do design).
 *
 * Não é conteúdo editável porque não vem da literatura: é a constatação do
 * próprio mecanismo de que não há regra cadastrada apontando para a estratégia.
 * Colocá-la em "possível" sugeriria avaliação que não houve; colocá-la em "não
 * recomendada" seria descartar sem evidência.
 */
export const RAZAO_SEM_REGRA_CADASTRADA =
  'O corpus não fornece regra que permita recomendá-la ou descartá-la.';

/**
 * Estratégias que nenhuma regra do conteúdo menciona, na ordem do cadastro
 * (Seção 5.4 do design, Requisitos 2.1 e 2.4).
 *
 * É o complemento exato de {@link calcularPosicoes}: cada estratégia cadastrada
 * está em uma das duas saídas e em nenhuma das duas ao mesmo tempo. Hoje só
 * Relocate cai aqui — os requisitos registram em 6.1 e na limitação 6 que
 * nenhuma regra evidenciada do corpus a favorece. Repurchase não cai, porque
 * tem duas regras, ainda que ambas com marcação de interpretação e sem
 * caracterização no corpus: o que separa os dois grupos é a existência de regra,
 * não a qualidade da evidência.
 *
 * Não depende das respostas: a ausência de regra é propriedade do conteúdo, não
 * do cenário informado. Por isso o grupo desaparece sozinho quando uma versão
 * futura acrescenta regra para a estratégia, sem alteração deste módulo.
 */
export function estrategiasNaoAvaliadas(conteudo: Conteudo): EstrategiaNaoAvaliada[] {
  const comRegra = estrategiasComRegra(conteudo.regras);

  return conteudo.estrategias
    .filter((estrategia) => !comRegra.has(estrategia.id))
    .map((estrategia) => ({
      estrategia: estrategia.id,
      razao: RAZAO_SEM_REGRA_CADASTRADA,
    }));
}

/**
 * Estratégias para as quais existe ao menos uma regra cadastrada, de qualquer
 * tipo de efeito e em qualquer direção. Basta ser mencionada: se a regra se
 * aplica ou não a um cenário é outra questão, respondida em
 * {@link calcularPosicaoDeEstrategia} por `nenhumaRegraAplicada`.
 */
function estrategiasComRegra(regras: readonly Regra[]): ReadonlySet<Id> {
  return new Set(regras.map((regra) => regra.estrategiaAlvo));
}

/**
 * Ordem de apresentação: faixa e, dentro dela, saldo decrescente (Seção 5.2 do
 * design). O saldo ordena mas não é exibido. A ordenação do JavaScript é
 * estável, de modo que estratégias empatadas mantêm a ordem do cadastro.
 */
export function compararPosicoes(a: PosicaoDeEstrategia, b: PosicaoDeEstrategia): number {
  const porFaixa = ORDEM_DAS_FAIXAS[a.faixa] - ORDEM_DAS_FAIXAS[b.faixa];
  return porFaixa !== 0 ? porFaixa : b.saldo - a.saldo;
}

/** Faixa correspondente ao saldo (Seção 5.2 do design). */
function faixaDe(saldo: number, algumaPrecondicaoFalhou: boolean): Faixa {
  // A precondição decide antes do saldo: nenhuma soma de contribuições tira a
  // estratégia de "não recomendada".
  if (algumaPrecondicaoFalhou) return 'naoRecomendada';
  if (saldo >= 1) return 'recomendada';
  if (saldo <= -1) return 'naoRecomendada';
  return 'possivel';
}

/**
 * Respostas registradas para os critérios dos pares indicados, sem repetição.
 * Serve ao motivo do descarte da precondição contradita.
 */
function respostasDosPares(
  pares: readonly { criterio: Id }[],
  porCriterio: ReadonlyMap<Id, Resposta>,
): Resposta[] {
  const respostas: Resposta[] = [];
  for (const par of pares) {
    const resposta = porCriterio.get(par.criterio);
    if (resposta !== undefined && !respostas.includes(resposta)) {
      respostas.push(resposta);
    }
  }
  return respostas;
}
