/**
 * Revisão de resposta já registrada (Seções 2.2, 2.4 e 4 do design;
 * Requisito 1.5).
 *
 * `sessao.ts` registra a primeira resposta de um critério e recusa a segunda de
 * propósito: substituir uma resposta é operação declarada, não efeito colateral
 * de um registro repetido. Este módulo é essa operação. Faz três coisas, na
 * ordem:
 *
 * 1. **Substitui o valor registrado**, na posição em que a resposta já estava —
 *    revisar não reordena a sessão nem faz o critério parecer respondido depois
 *    do que veio a seguir.
 * 2. **Reconcilia as respostas posteriores**, descartando as que só existiam por
 *    causa do valor antigo.
 * 3. **Recalcula** a posição de todas as estratégias e a próxima pergunta, a
 *    partir das respostas que sobraram.
 *
 * ## O efeito colateral que a reconciliação trata
 *
 * A coleta é adaptativa: uma pergunta só é apresentada quando as condições
 * declaradas para ela são satisfeitas pelas respostas já registradas
 * (Requisito 1.3) e quando ainda é capaz de alterar o resultado (Requisito 1.4).
 * Logo, parte das respostas de uma sessão **existe por causa de outra resposta
 * anterior**. Revisar essa resposta anterior pode retirar o fundamento das
 * seguintes, em dois sentidos:
 *
 * - **Pergunta que deixou de valer.** As quatro verificações de PaaS do Bloco F
 *   ([Khouibiri2024], P15 a P18) só aparecem com Replatform em jogo. Se a
 *   revisão de P4 passa a acusar componente sob exigência regulatória, a
 *   precondição de [Ramchand2021] fixa Replatform em "não recomendada" e o
 *   Bloco F sai de circulação. As respostas que ele havia colhido não podem
 *   permanecer: em uma sessão iniciada já com o valor novo, essas perguntas
 *   nunca teriam sido feitas.
 * - **Pergunta que voltou a circular.** O caminho inverso — a revisão que
 *   devolve Replatform ao jogo — traz de volta perguntas que a sessão havia
 *   saltado. Nada precisa ser desfeito para isso: elas voltam a ser aplicáveis e
 *   `proximaPergunta` as apresenta.
 *
 * **Decisão de projeto — descartar em lugar de guardar.** A resposta invalidada
 * é removida das respostas da sessão, não arquivada em um histórico paralelo. O
 * critério de comparação é o da Seção 8.2 do design: alterar uma resposta
 * anterior produz o mesmo resultado de uma sessão iniciada já com o valor novo.
 * Guardar a resposta órfã quebraria essa igualdade em dois pontos visíveis ao
 * usuário — ela continuaria acionando regras, e apareceria ou desapareceria da
 * lista de critérios sem resposta do resultado parcial (Requisito 3.4) conforme
 * a ordem em que o usuário revisou. As invalidadas voltam em
 * {@link RevisaoDeResposta.respostasInvalidadas} para a interface poder avisar o
 * que a revisão custou; se a pergunta voltar a circular depois, é perguntada de
 * novo, o que é o comportamento honesto: a sessão não presume que a resposta
 * antiga continuaria valendo.
 *
 * **Resposta a critério que nenhuma pergunta investiga é preservada.** A
 * reconciliação só descarta resposta cujo critério é investigado por alguma
 * pergunta do catálogo e nenhuma delas continua aplicável. Critério sem pergunta
 * alguma não é governado pela seleção, e o mecanismo não tem base para julgar se
 * a resposta ainda cabe.
 *
 * `criteriosSemResposta` continua **derivada** das respostas registradas
 * (`criteriosSemRespostaDe`), e é por isso que revisar "não sei" para um valor,
 * ou um valor para "não sei", mantém a lista correta sem nada a desfazer: ela é
 * uma leitura do que está registrado, não um acumulador.
 *
 * Funções puras: a sessão recebida não é alterada, e a revisão devolve uma
 * sessão nova. É o que permite à interface (tarefa 7.2) apresentar o efeito de
 * uma revisão antes de confirmá-la, e ao recálculo "e se" (Requisito 3.5)
 * avaliar valores hipotéticos sem sujar a sessão do usuário.
 */
import { calcularPosicoes } from '../dominio/posicoes';
import type {
  Conteudo,
  Id,
  Pergunta,
  PosicaoDeEstrategia,
  Resposta,
  Sessao,
} from '../dominio/tipos';
import { perguntasAplicaveis, proximaPergunta } from './selecao';
import {
  ErroDeRegistroDeResposta,
  RESPOSTA_DESCONHECIDA,
  criteriosSemRespostaDe,
  normalizarValor,
  type ValorInformado,
} from './sessao';

/**
 * O que a sessão passa a ser depois de uma resposta revisada.
 *
 * Espelha `RegistroDeResposta` de `sessao.ts` e acrescenta o que só a revisão
 * produz: a resposta substituída e as respostas que perderam o fundamento.
 * `proximaPergunta` indefinida significa que, com o valor novo, nenhuma pergunta
 * pendente é capaz de alterar o resultado — o encerramento da coleta, tratado em
 * `encerramento.ts`.
 */
export interface RevisaoDeResposta {
  sessao: Sessao;
  /** A resposta que passou a valer para o critério revisado. */
  resposta: Resposta;
  /** A resposta que estava registrada antes da revisão. */
  respostaAnterior: Resposta;
  /**
   * Respostas descartadas porque a pergunta que as colheu deixou de ser
   * apresentável com o valor novo, na ordem em que estavam registradas.
   */
  respostasInvalidadas: Resposta[];
  posicoes: PosicaoDeEstrategia[];
  proximaPergunta?: Pergunta;
}

/** Resultado da reconciliação de uma lista de respostas com o catálogo. */
export interface Reconciliacao {
  /** Respostas que continuam de pé, na ordem original. */
  mantidas: Resposta[];
  /** Respostas cuja pergunta deixou de ser apresentável. */
  invalidadas: Resposta[];
}

/**
 * Substitui a resposta registrada para o critério e devolve a sessão
 * resultante, com as respostas posteriores reconciliadas, a posição de todas as
 * estratégias recalculada e a próxima pergunta já selecionada (Requisito 1.5).
 *
 * Aceita valor cadastrado, conjunto de valores quando o critério admite
 * múltiplos, e {@link RESPOSTA_DESCONHECIDA} — revisar para "não sei" é revisão
 * como qualquer outra, e não exige justificativa nem estimativa
 * (Requisito 3.2). Não altera a sessão recebida.
 *
 * @throws {ErroDeRegistroDeResposta} quando o critério não existe no conteúdo da
 * sessão, quando não há resposta registrada para ele — registrar a primeira é
 * `registrarResposta`, não revisão — ou quando o valor informado não é
 * admissível para o critério.
 */
export function revisarResposta(
  sessao: Sessao,
  criterio: Id,
  valor: ValorInformado,
  momento: string = new Date().toISOString(),
): RevisaoDeResposta {
  const cadastrado = sessao.conteudo.criterios.find((item) => item.id === criterio);
  if (cadastrado === undefined) {
    throw new ErroDeRegistroDeResposta(
      'criterioInexistente',
      criterio,
      'não há critério com esse identificador no conteúdo da sessão',
    );
  }

  const respostaAnterior = sessao.respostas.find((resposta) => resposta.criterio === criterio);
  if (respostaAnterior === undefined) {
    throw new ErroDeRegistroDeResposta(
      'criterioSemRespostaRegistrada',
      criterio,
      'não há resposta registrada para revisar; a primeira resposta é registro',
    );
  }

  // Substituição no lugar: a resposta revisada mantém a posição que já ocupava,
  // e o momento passa a ser o da revisão.
  const resposta: Resposta = {
    criterio,
    valor: normalizarValor(cadastrado, valor),
    momento,
  };
  const candidatas = sessao.respostas.map((registrada) =>
    registrada.criterio === criterio ? resposta : registrada,
  );

  const { mantidas, invalidadas } = reconciliarRespostas(sessao.conteudo, candidatas);

  return {
    sessao: {
      ...sessao,
      respostas: mantidas,
      // Derivada, nunca acumulada: revisar "não sei" para um valor tira o
      // critério da lista sem que nada precise ser desfeito (Requisito 3.4).
      criteriosSemResposta: criteriosSemRespostaDe(mantidas),
    },
    resposta,
    respostaAnterior,
    respostasInvalidadas: invalidadas,
    // Recálculo da posição de todas as estratégias (Requisito 1.5, Seção 6 do
    // design: a posição é recalculada a cada resposta registrada ou revisada).
    posicoes: calcularPosicoes(sessao.conteudo, mantidas),
    // Reavaliação das perguntas seguintes: pergunta que voltou a circular volta
    // a ser apresentada, pergunta que deixou de valer não reaparece.
    proximaPergunta: proximaPergunta({ conteudo: sessao.conteudo, respostas: mantidas }),
  };
}

/**
 * Revisa a resposta do critério para "não sei".
 *
 * Atalho de leitura sobre {@link revisarResposta}, simétrico de
 * `registrarRespostaDesconhecida`: as regras que dependem do critério deixam de
 * se aplicar sem descartar estratégia alguma (Requisito 3.3) e o critério entra
 * na lista de critérios sem resposta do resultado parcial (Requisito 3.4).
 */
export function revisarRespostaDesconhecida(
  sessao: Sessao,
  criterio: Id,
  momento?: string,
): RevisaoDeResposta {
  return revisarResposta(sessao, criterio, RESPOSTA_DESCONHECIDA, momento);
}

/**
 * O critério tem resposta registrada e portanto pode ser revisado?
 *
 * Serve à interface, que precisa saber quais respostas oferece para alterar sem
 * provocar {@link ErroDeRegistroDeResposta} para descobrir.
 */
export function podeRevisar(sessao: Sessao, criterio: Id): boolean {
  return sessao.respostas.some((resposta) => resposta.criterio === criterio);
}

/**
 * Percorre as respostas na ordem do registro e separa as que continuam de pé
 * das que perderam o fundamento.
 *
 * Cada resposta é confrontada com o catálogo diante das respostas **mantidas até
 * ali**, que é exatamente o estado em que a pergunta teria sido apresentada em
 * uma sessão conduzida com esses valores. A avaliação incremental é o que faz a
 * invalidação em cadeia funcionar: descartada uma resposta, a seguinte é julgada
 * sem ela, e pode cair pelo mesmo motivo.
 *
 * Uma resposta é mantida quando alguma pergunta aplicável investiga o seu
 * critério, ou quando nenhuma pergunta do catálogo investiga aquele critério —
 * nesse caso a seleção não governa a resposta, e descartá-la seria decisão sem
 * fundamento. A própria resposta ainda não está entre as mantidas quando é
 * avaliada, de modo que "já respondida" não interfere no julgamento.
 *
 * Exposta porque é o comportamento que a revisão precisa declarar, e porque a
 * interface e o teste precisam poder verificá-lo sem passar por uma revisão.
 */
export function reconciliarRespostas(
  conteudo: Conteudo,
  respostas: readonly Resposta[],
): Reconciliacao {
  const investigadosPeloCatalogo = new Set(
    conteudo.perguntas.map((pergunta) => pergunta.criterio),
  );

  const mantidas: Resposta[] = [];
  const invalidadas: Resposta[] = [];

  for (const resposta of respostas) {
    if (!investigadosPeloCatalogo.has(resposta.criterio)) {
      mantidas.push(resposta);
      continue;
    }

    const aplicaveis = perguntasAplicaveis({ conteudo, respostas: mantidas });
    if (aplicaveis.some((pergunta) => pergunta.criterio === resposta.criterio)) {
      mantidas.push(resposta);
    } else {
      invalidadas.push(resposta);
    }
  }

  return { mantidas, invalidadas };
}
