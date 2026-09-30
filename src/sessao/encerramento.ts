/**
 * Encerramento da coleta e montagem do resultado (Seções 4.2 e 5 do design;
 * Requisitos 1.4, 2.1, 2.4, 2.5, 2.6, 3.4 e 4.5).
 *
 * `selecao.ts` responde qual é a próxima pergunta e `sessao.ts` o que acontece
 * quando ela é respondida. Este módulo responde as duas últimas perguntas da
 * coleta: **acabou?** e **o que se apresenta agora?**
 *
 * - **Acabou** quando não resta pergunta aplicável capaz de alterar as
 *   estratégias recomendadas (Requisito 1.4). Não há critério novo aqui: é
 *   exatamente a ausência de próxima pergunta, e as três condições que retiram
 *   uma pergunta de circulação estão em `selecao.ts` — já respondida, condição
 *   de exibição não satisfeita, estratégias afetadas todas fixadas (Seção 4.2 do
 *   design). Como o catálogo é finito e nenhuma pergunta repete, esse momento
 *   sempre chega.
 * - **Ou o usuário encerra antes.** Encerrar é sempre possível: o resultado sai
 *   do que já foi registrado, e as perguntas que ficaram sem resposta entram na
 *   lista de critérios sem resposta que o resultado parcial exibe. Não existe
 *   estado inválido de encerramento, e por isso {@link encerrarColeta} não
 *   recusa nada — o motivo do encerramento é **derivado** do estado, em lugar de
 *   informado por quem chama: se ainda havia pergunta aplicável, foi
 *   encerramento antes do fim, e o resultado o declara.
 *
 * O resultado reúne, sem decidir nada por conta própria, o que as Seções 5.2 a
 * 5.5 do design mandam apresentar: as três faixas com as regras que justificam
 * cada posição, o grupo "não avaliada pelo Guia" com a razão, o indicativo de
 * resultado parcial com a lista de critérios sem resposta e a declaração de que
 * a sessão não distinguiu alternativas quando nada foi descartado.
 *
 * Duas leituras merecem estar explícitas, porque são escolha e não consequência:
 *
 * - **"Não avaliada" não é "descartada".** A estratégia sem regra cadastrada não
 *   foi rejeitada, foi deixada de fora da avaliação (Seção 5.4). Logo, ela não
 *   conta para a declaração do Requisito 2.6: o que conta é a faixa "não
 *   recomendada", que é onde o descarte acontece.
 * - **Critério sem resposta é mais do que "não sei".** O Requisito 3.4 fala das
 *   respostas desconhecidas, e é isso que `criteriosDeclaradosDesconhecidos`
 *   traz. Mas quando o usuário encerra antes do fim, as perguntas que ficaram na
 *   fila são lacuna da mesma natureza, e omiti-las faria o resultado parecer mais
 *   completo do que é. As duas listas ficam separadas e `criteriosSemResposta` é
 *   a união — base tanto do aviso de resultado parcial quanto da visão "e se"
 *   (Requisito 3.5, tarefa 8.1). Perguntas que saíram de circulação por não
 *   poderem mudar nada não entram: apontá-las como lacuna seria falso.
 *
 * Funções puras, sem leitura de arquivo e sem estado: o resultado é uma leitura
 * do que está registrado. Nada é acumulado ao longo da sessão, e é isso que
 * permite à revisão de resposta (Requisito 1.5, tarefa 5.4) e ao recálculo "e
 * se" chamarem este módulo sobre respostas hipotéticas sem desfazer nada.
 *
 * O que este módulo não faz: os avisos de limite do Requisito 4 — apoio à
 * decisão, ausência de plano de execução e ausência de estimativa de custo —,
 * que são conteúdo cadastrado e exibição da interface (Seção 5.6 do design,
 * tarefa 7.4).
 */
import { calcularPosicoes, estrategiasNaoAvaliadas } from '../dominio/posicoes';
import type {
  EstrategiaNaoAvaliada,
  Faixa,
  Id,
  Pergunta,
  PosicaoDeEstrategia,
} from '../dominio/tipos';
import { perguntasAplicaveis, type EstadoDaColeta } from './selecao';
import { criteriosSemRespostaDe } from './sessao';

/** Por que a coleta terminou. */
export type MotivoDeEncerramento =
  /**
   * Nenhuma pergunta pendente era capaz de alterar as estratégias recomendadas
   * (Requisito 1.4). É o encerramento normal.
   */
  | 'semPerguntaCapazDeAlterar'
  /**
   * O usuário pediu para encerrar com perguntas ainda na fila. O resultado sai
   * do que foi registrado até ali, declarado parcial.
   */
  | 'solicitadoPeloUsuario';

/** Por que o resultado é parcial. */
export type RazaoDeResultadoParcial =
  /** Ao menos um critério foi respondido como "não sei" (Requisito 3.4). */
  | 'respostaDesconhecida'
  /** A coleta terminou antes de esgotar as perguntas aplicáveis. */
  | 'coletaEncerradaAntesDoFim';

/**
 * Declaração exigida quando nenhuma estratégia foi descartada (Requisito 2.6).
 *
 * Fica no mecanismo, e não no conteúdo editável, porque não vem da literatura:
 * é a constatação de que a sessão não separou alternativa alguma. O texto é o
 * mesmo em toda sessão.
 */
export const DECLARACAO_SEM_DISTINCAO =
  'A sessão não distinguiu alternativas: nenhuma estratégia foi descartada com as respostas registradas.';

/**
 * O quadro final da sessão (Seção 5.5 do design).
 *
 * `posicoes` traz todas as estratégias avaliadas na ordem de apresentação —
 * recomendadas primeiro, por saldo decrescente, depois possíveis e não
 * recomendadas; `recomendadas`, `possiveis` e `naoRecomendadas` são a mesma
 * lista fatiada por faixa, para a interface não precisar filtrar. Cada posição
 * carrega as regras a favor, as regras contra, as precondições falhadas e as
 * marcações, que é o rastro exigido pelos Requisitos 2.2 a 2.5.
 */
export interface ResultadoDaSessao {
  motivoDeEncerramento: MotivoDeEncerramento;

  /** Todas as estratégias avaliadas, na ordem de apresentação. */
  posicoes: PosicaoDeEstrategia[];
  recomendadas: PosicaoDeEstrategia[];
  possiveis: PosicaoDeEstrategia[];
  /** Descartadas, com o motivo: precondição falhada ou regras contra. */
  naoRecomendadas: PosicaoDeEstrategia[];

  /** Estratégias sem regra cadastrada, com a razão (Seção 5.4 do design). */
  naoAvaliadas: EstrategiaNaoAvaliada[];

  /** O resultado é parcial (Requisito 3.4). */
  ehParcial: boolean;
  razoesDeResultadoParcial: RazaoDeResultadoParcial[];
  /** Critérios sem resposta: os declarados desconhecidos e os não perguntados. */
  criteriosSemResposta: Id[];
  /** Critérios respondidos como "não sei", na ordem do registro. */
  criteriosDeclaradosDesconhecidos: Id[];
  /** Critérios de perguntas que continuavam aplicáveis quando a coleta parou. */
  criteriosNaoPerguntados: Id[];
  /** As perguntas correspondentes, na ordem em que seriam apresentadas. */
  perguntasNaoApresentadas: Pergunta[];

  /** Nenhuma estratégia foi descartada (Requisito 2.6). */
  naoDistinguiuAlternativas: boolean;
  /** Presente quando {@link naoDistinguiuAlternativas} é verdadeiro. */
  declaracaoSemDistincao?: string;

  /** Estratégias cuja posição se apoia em regra de interpretação (Requisito 2.5). */
  estrategiasComMarcacaoDeInterpretacao: Id[];
  /** Estratégias cuja posição se apoia só em evidência de porte grande (Requisito 4.5). */
  estrategiasComMarcacaoDePorte: Id[];
}

/**
 * A coleta pode ser encerrada por esgotamento das perguntas?
 *
 * Verdadeiro quando nenhuma pergunta aplicável resta, que é a tradução literal
 * do Requisito 1.4 e o critério da Seção 4.2 do design. Não impede o usuário de
 * encerrar antes: serve à interface, que precisa saber se apresenta a próxima
 * pergunta ou o resultado.
 */
export function coletaEncerrada(estado: EstadoDaColeta): boolean {
  return perguntasAplicaveis(estado).length === 0;
}

/**
 * Encerra a coleta e monta o resultado a partir do que está registrado.
 *
 * Aceita a própria sessão — que atende a {@link EstadoDaColeta} — e também um
 * estado montado com respostas hipotéticas, o que é o que a visão "e se"
 * precisa. Não altera nada do que recebe.
 *
 * O motivo do encerramento é derivado: se ainda havia pergunta aplicável, o
 * resultado sai marcado como encerrado antes do fim, com as perguntas que
 * ficaram na fila declaradas como lacuna.
 */
export function encerrarColeta(estado: EstadoDaColeta): ResultadoDaSessao {
  const perguntasNaoApresentadas = perguntasAplicaveis(estado);
  const posicoes = calcularPosicoes(estado.conteudo, estado.respostas);

  const daFaixa = (faixa: Faixa) => posicoes.filter((posicao) => posicao.faixa === faixa);
  const naoRecomendadas = daFaixa('naoRecomendada');

  const criteriosDeclaradosDesconhecidos = criteriosSemRespostaDe(estado.respostas);
  const criteriosNaoPerguntados = criteriosDistintos(perguntasNaoApresentadas).filter(
    (criterio) => !criteriosDeclaradosDesconhecidos.includes(criterio),
  );

  const razoesDeResultadoParcial: RazaoDeResultadoParcial[] = [];
  if (criteriosDeclaradosDesconhecidos.length > 0) {
    razoesDeResultadoParcial.push('respostaDesconhecida');
  }
  if (perguntasNaoApresentadas.length > 0) {
    razoesDeResultadoParcial.push('coletaEncerradaAntesDoFim');
  }

  // Descarte é a faixa "não recomendada". Estratégia não avaliada não conta:
  // não foi rejeitada, ficou fora da avaliação (Seção 5.4 do design).
  const naoDistinguiuAlternativas = naoRecomendadas.length === 0;

  return {
    motivoDeEncerramento:
      perguntasNaoApresentadas.length === 0
        ? 'semPerguntaCapazDeAlterar'
        : 'solicitadoPeloUsuario',

    posicoes,
    recomendadas: daFaixa('recomendada'),
    possiveis: daFaixa('possivel'),
    naoRecomendadas,

    naoAvaliadas: estrategiasNaoAvaliadas(estado.conteudo),

    ehParcial: razoesDeResultadoParcial.length > 0,
    razoesDeResultadoParcial,
    criteriosSemResposta: [...criteriosDeclaradosDesconhecidos, ...criteriosNaoPerguntados],
    criteriosDeclaradosDesconhecidos,
    criteriosNaoPerguntados,
    perguntasNaoApresentadas,

    naoDistinguiuAlternativas,
    ...(naoDistinguiuAlternativas ? { declaracaoSemDistincao: DECLARACAO_SEM_DISTINCAO } : {}),

    estrategiasComMarcacaoDeInterpretacao: posicoes
      .filter((posicao) => posicao.temMarcacaoDeInterpretacao)
      .map((posicao) => posicao.estrategia),
    estrategiasComMarcacaoDePorte: posicoes
      .filter((posicao) => posicao.temMarcacaoDePorte)
      .map((posicao) => posicao.estrategia),
  };
}

/**
 * Critérios investigados pelas perguntas, sem repetição e na ordem em que
 * apareceriam. Mais de uma pergunta pode investigar o mesmo critério, e a
 * lacuna é do critério, não da pergunta.
 */
function criteriosDistintos(perguntas: readonly Pergunta[]): Id[] {
  const criterios: Id[] = [];
  for (const pergunta of perguntas) {
    if (!criterios.includes(pergunta.criterio)) criterios.push(pergunta.criterio);
  }
  return criterios;
}
