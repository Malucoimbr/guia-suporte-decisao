/**
 * Avaliação de condições sobre as respostas registradas na sessão
 * (Seção 5 do design; Requisitos 2.2, 3.3 e 5.4).
 *
 * Uma condição é uma **conjunção** de pares critério–valor: condição composta,
 * como valor de negócio alto e qualidade técnica ruim, é uma única condição e
 * portanto uma única regra (Seção 6 do design). Este módulo responde uma coisa
 * só — dado o que a sessão já registrou, essa condição vale? — e não sabe nada
 * sobre pontuação, faixas ou ordem de perguntas.
 *
 * O ponto central é que a resposta não é binária. São três estados:
 *
 * - **satisfeita**: todos os pares casam com as respostas registradas.
 * - **não satisfeita**: algum par contradiz uma resposta registrada.
 * - **indeterminada**: nenhum par contradiz, mas ao menos um depende de
 *   critério respondido como "não sei" ou ainda sem resposta.
 *
 * O terceiro estado é exigência do Requisito 3.3: "não sei" desliga as regras
 * que dependem daquele critério **sem descartar estratégia alguma**. Se a
 * avaliação devolvesse apenas verdadeiro ou falso, uma precondição
 * indeterminada seria indistinguível de uma precondição que falhou, e a
 * estratégia iria para "não recomendada" por ausência de informação — o oposto
 * da preservação conservadora declarada na Seção 4.3 do design. Critério ainda
 * não perguntado recebe o mesmo tratamento por outro motivo: ele nem satisfaz
 * nem viola a condição, e é isso que permite ao cálculo de posição (4.2) e ao
 * recálculo "e se" (8.1) distinguir o que já se sabe do que falta saber.
 *
 * **Decisão de projeto — contradição vence indeterminação.** Se um par
 * contradiz uma resposta e outro está indeterminado, o resultado é "não
 * satisfeita": em uma conjunção, um termo falso já decide o valor do todo, e
 * saber o resto não muda nada. A distinção importa para o recálculo "e se", que
 * assim não oferece ao usuário buscar informação incapaz de alterar o
 * resultado.
 *
 * Funções puras, sem leitura de arquivo e sem estado: a mesma condição contra
 * as mesmas respostas devolve sempre o mesmo resultado.
 */
import type { Condicao, Id, ParCriterioValor, Resposta } from './tipos';

/** Os três estados de avaliação de uma condição. */
export type ResultadoDeCondicao = 'satisfeita' | 'naoSatisfeita' | 'indeterminada';

/**
 * Avaliação de uma condição, com o rastro que a justifica.
 *
 * `respostasQueSatisfizeram` é o que o resultado exibe como "as respostas que
 * satisfizeram a condição" (Requisito 2.2), e só vem preenchida quando a
 * condição está satisfeita. As duas listas de critérios indeterminados são
 * separadas porque a origem da indeterminação é diferente: "não sei" é escolha
 * registrada do usuário e entra na lista de critérios sem resposta do resultado
 * parcial (Requisito 3.4); critério ausente é pergunta que a sessão ainda não
 * fez.
 */
export interface AvaliacaoDeCondicao {
  resultado: ResultadoDeCondicao;
  /** Respostas que casaram com os pares, na ordem dos pares, sem repetição. */
  respostasQueSatisfizeram: Resposta[];
  /** Pares que contradizem uma resposta registrada. */
  paresNaoSatisfeitos: ParCriterioValor[];
  /** Critérios da condição respondidos como "não sei". */
  criteriosDesconhecidos: Id[];
  /** Critérios da condição ainda sem resposta registrada. */
  criteriosSemResposta: Id[];
}

/** Situação de um único par critério–valor diante das respostas. */
type SituacaoDePar = 'casa' | 'contradiz' | 'desconhecido' | 'ausente';

/**
 * Avalia um par critério–valor contra a resposta registrada para o seu critério.
 *
 * O critério pode admitir resposta múltipla, e os valores de um critério não
 * precisam ser mutuamente exclusivos ([Mwilu2024], Requisito 5.4). Por isso o
 * par casa quando o valor exigido está **entre** os valores escolhidos, em vez
 * de ser igual à resposta: a mesma resposta múltipla pode satisfazer condições
 * diferentes.
 */
function situacaoDoPar(par: ParCriterioValor, resposta: Resposta | undefined): SituacaoDePar {
  if (resposta === undefined) return 'ausente';
  if (resposta.valor.tipo === 'desconhecida') return 'desconhecido';
  return resposta.valor.valores.includes(par.valor) ? 'casa' : 'contradiz';
}

/**
 * Indexa as respostas por critério.
 *
 * Havendo mais de uma resposta para o mesmo critério, vale a última: a revisão
 * substitui o valor registrado (Requisito 1.5), e ler a última mantém a
 * avaliação correta mesmo que quem chama acumule as respostas em lugar de
 * substituí-las.
 */
export function indexarRespostasPorCriterio(
  respostas: readonly Resposta[],
): Map<Id, Resposta> {
  const porCriterio = new Map<Id, Resposta>();
  for (const resposta of respostas) {
    porCriterio.set(resposta.criterio, resposta);
  }
  return porCriterio;
}

/**
 * Avalia uma condição contra as respostas registradas na sessão.
 *
 * Condição sem par algum é satisfeita por vacuidade — a conjunção vazia é
 * verdadeira. A verificação de consistência já acusa esse caso no conteúdo,
 * porque uma regra assim se aplicaria sempre; aqui não se inventa exceção.
 */
export function avaliarCondicao(
  condicao: Condicao,
  respostas: readonly Resposta[] | ReadonlyMap<Id, Resposta>,
): AvaliacaoDeCondicao {
  const porCriterio =
    respostas instanceof Map
      ? (respostas as ReadonlyMap<Id, Resposta>)
      : indexarRespostasPorCriterio(respostas as readonly Resposta[]);

  const respostasQueSatisfizeram: Resposta[] = [];
  const paresNaoSatisfeitos: ParCriterioValor[] = [];
  const criteriosDesconhecidos: Id[] = [];
  const criteriosSemResposta: Id[] = [];

  for (const par of condicao.pares) {
    const resposta = porCriterio.get(par.criterio);
    switch (situacaoDoPar(par, resposta)) {
      case 'casa':
        // `resposta` existe quando o par casa; a lista alimenta o motivo exibido.
        if (resposta !== undefined && !respostasQueSatisfizeram.includes(resposta)) {
          respostasQueSatisfizeram.push(resposta);
        }
        break;
      case 'contradiz':
        paresNaoSatisfeitos.push(par);
        break;
      case 'desconhecido':
        if (!criteriosDesconhecidos.includes(par.criterio)) {
          criteriosDesconhecidos.push(par.criterio);
        }
        break;
      case 'ausente':
        if (!criteriosSemResposta.includes(par.criterio)) {
          criteriosSemResposta.push(par.criterio);
        }
        break;
    }
  }

  const resultado: ResultadoDeCondicao =
    paresNaoSatisfeitos.length > 0
      ? 'naoSatisfeita'
      : criteriosDesconhecidos.length > 0 || criteriosSemResposta.length > 0
        ? 'indeterminada'
        : 'satisfeita';

  return {
    resultado,
    // O motivo só é exibido para condição satisfeita; nos outros casos a lista
    // seria um rastro parcial, que sugeriria aplicação que não houve.
    respostasQueSatisfizeram: resultado === 'satisfeita' ? respostasQueSatisfizeram : [],
    paresNaoSatisfeitos,
    criteriosDesconhecidos,
    criteriosSemResposta,
  };
}

/** Atalho de leitura: a condição está satisfeita pelas respostas registradas? */
export function condicaoSatisfeita(
  condicao: Condicao,
  respostas: readonly Resposta[] | ReadonlyMap<Id, Resposta>,
): boolean {
  return avaliarCondicao(condicao, respostas).resultado === 'satisfeita';
}

/**
 * Atalho de leitura: a condição está indeterminada?
 *
 * É a pergunta que interessa a quem precisa **não** agir — a regra não se
 * aplica e a estratégia não é descartada (Requisito 3.3) — e a quem monta a
 * visão "e se" a partir dos critérios que ainda podem mudar o resultado.
 */
export function condicaoIndeterminada(
  condicao: Condicao,
  respostas: readonly Resposta[] | ReadonlyMap<Id, Resposta>,
): boolean {
  return avaliarCondicao(condicao, respostas).resultado === 'indeterminada';
}
