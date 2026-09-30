/**
 * Abertura da sessão e registro de resposta (Seções 2.2 e 4 do design;
 * Requisitos 1.2, 3.1, 3.2, 3.3, 3.4 e 5.2).
 *
 * `selecao.ts` responde qual é a próxima pergunta; este módulo responde o que
 * acontece quando ela é respondida. São duas operações e nada mais:
 *
 * - **Abrir a sessão.** A sessão carrega o conteúdo vigente no início
 *   (Requisito 5.2) e passa a trabalhar sobre essa leitura: alteração de
 *   conteúdo vale para as sessões iniciadas depois, não para esta.
 * - **Registrar uma resposta.** Um valor cadastrado, um conjunto de valores
 *   quando o critério admite múltiplos, ou "não sei". A cada registro, a posição
 *   de todas as estratégias é recalculada e a próxima pergunta é reselecionada
 *   considerando tudo que já foi registrado (Requisito 1.2).
 *
 * Três coisas definem o comportamento:
 *
 * - **"Não sei" é resposta, não ausência de resposta.** É valor implícito de
 *   todo critério, não cadastrado no conteúdo (Requisito 3.1). Registrada, a
 *   sessão prossegue para a pergunta seguinte sem exigir justificativa nem
 *   estimativa (Requisito 3.2), as regras que dependem do critério deixam de se
 *   aplicar sem descartar estratégia alguma (Requisito 3.3) e o critério entra
 *   na lista de critérios sem resposta que o resultado parcial exibe
 *   (Requisito 3.4).
 * - **Valor fora do critério é recusado.** O conteúdo é editável, mas não é
 *   frouxo: registrar valor que não pertence ao critério, ou mais de um valor
 *   em critério que não admite resposta múltipla, é erro de quem chama, e falhar
 *   alto é melhor do que produzir recomendação a partir de resposta que o
 *   conteúdo não prevê. Não confundir com a exigência de [Mwilu2024] — os
 *   valores de um critério não precisam ser exclusivos nem exaustivos, e é por
 *   isso que "não sei" e a resposta múltipla existem, cada uma declarada.
 * - **A sessão não é mutada.** Cada registro devolve uma sessão nova. É o que
 *   permite à revisão de resposta (Requisito 1.5, tarefa 5.4) recalcular a
 *   partir das respostas, e ao recálculo "e se" (Requisito 3.5) avaliar valores
 *   hipotéticos sem sujar a sessão do usuário.
 *
 * `criteriosSemResposta` é **derivada** das respostas registradas, não
 * acumulada à parte: assim a lista continua correta quando uma resposta "não
 * sei" for depois substituída por um valor, sem que a revisão precise desfazer
 * nada.
 *
 * O que este módulo não faz: decidir quando a coleta termina e montar o
 * resultado (`encerramento.ts`) e substituir resposta já registrada
 * (`revisao.ts`). Registrar duas vezes o mesmo critério é recusado aqui de
 * propósito — revisão é operação declarada, não efeito colateral de um segundo
 * registro.
 */
import { carregarConteudo } from '../dominio/carga';
import { calcularPosicoes } from '../dominio/posicoes';
import type {
  Conteudo,
  Criterio,
  Id,
  Pergunta,
  PosicaoDeEstrategia,
  Resposta,
  RespostaDesconhecida,
  Sessao,
  ValorRegistrado,
} from '../dominio/tipos';
import { proximaPergunta } from './selecao';

/** "Não sei": valor implícito de todo critério (Requisito 3.1). */
export const RESPOSTA_DESCONHECIDA: RespostaDesconhecida = { tipo: 'desconhecida' };

/**
 * Valor como quem chama informa: um valor cadastrado, uma lista de valores, ou
 * já a forma final — inclusive {@link RESPOSTA_DESCONHECIDA}.
 */
export type ValorInformado = ValorRegistrado | Id | readonly Id[];

/** Por que um registro foi recusado. */
export type MotivoDeRecusa =
  /** O critério não está cadastrado no conteúdo da sessão. */
  | 'criterioInexistente'
  /** O critério já tem resposta registrada: substituir é revisão (Requisito 1.5). */
  | 'criterioJaRespondido'
  /**
   * O critério não tem resposta registrada, e portanto não há o que revisar
   * (`revisao.ts`, Requisito 1.5). O simétrico de `criterioJaRespondido`:
   * registrar a primeira resposta é registro, substituí-la é revisão.
   */
  | 'criterioSemRespostaRegistrada'
  /** Nenhum valor informado; "não sei" é a forma de não escolher. */
  | 'semValor'
  /** Algum valor informado não pertence ao critério. */
  | 'valorNaoPertenceAoCriterio'
  /** O mesmo valor foi informado mais de uma vez. */
  | 'valorRepetido'
  /** Mais de um valor em critério que não admite resposta múltipla. */
  | 'respostaMultiplaNaoAdmitida';

/** Registro recusado. Traz o motivo em código, além da mensagem legível. */
export class ErroDeRegistroDeResposta extends Error {
  readonly motivo: MotivoDeRecusa;
  readonly criterio: Id;

  constructor(motivo: MotivoDeRecusa, criterio: Id, detalhe: string) {
    super(`Resposta recusada para o critério "${criterio}": ${detalhe}`);
    this.name = 'ErroDeRegistroDeResposta';
    this.motivo = motivo;
    this.criterio = criterio;
  }
}

/**
 * O que a sessão passa a ser depois de uma resposta registrada.
 *
 * A posição das estratégias vem recalculada porque é isso que o registro
 * provoca (Seção 6 do design: a posição é recalculada a cada resposta
 * registrada ou revisada), e a próxima pergunta vem selecionada porque é o que
 * a interface precisa a seguir. `proximaPergunta` indefinida significa que
 * nenhuma pergunta pendente é capaz de alterar o resultado — o encerramento da
 * coleta, tratado na tarefa 5.3.
 */
export interface RegistroDeResposta {
  sessao: Sessao;
  resposta: Resposta;
  posicoes: PosicaoDeEstrategia[];
  proximaPergunta?: Pergunta;
}

/** Opções de abertura. Existem para o teste e para a visão "e se". */
export interface OpcoesDeAbertura {
  /** Conteúdo já carregado. Ausente, a sessão lê o conteúdo vigente. */
  conteudo?: Conteudo;
  id?: Id;
  /** Início em ISO 8601. */
  inicio?: string;
}

/**
 * Abre uma sessão sobre o conteúdo vigente.
 *
 * A leitura acontece aqui, uma vez (Requisito 5.2, Seção 2.1 do design): a
 * sessão inteira é conduzida contra o conteúdo desta leitura, e edições
 * posteriores ao JSON alcançam apenas as sessões abertas depois. Sem histórico
 * de versões — é a decisão de projeto da Seção 2.1.
 */
export function abrirSessao(opcoes: OpcoesDeAbertura = {}): Sessao {
  return {
    id: opcoes.id ?? identificadorDeSessao(),
    inicio: opcoes.inicio ?? new Date().toISOString(),
    conteudo: opcoes.conteudo ?? carregarConteudo(),
    respostas: [],
    criteriosSemResposta: [],
  };
}

/**
 * Registra a resposta de um critério e devolve a sessão resultante, com a
 * posição das estratégias recalculada e a próxima pergunta já selecionada.
 *
 * Aceita valor cadastrado, conjunto de valores quando o critério admite
 * múltiplos, e {@link RESPOSTA_DESCONHECIDA}. Não altera a sessão recebida.
 *
 * @throws {ErroDeRegistroDeResposta} quando o critério não existe, já tem
 * resposta, ou o valor informado não é admissível para ele.
 */
export function registrarResposta(
  sessao: Sessao,
  criterio: Id,
  valor: ValorInformado,
  momento: string = new Date().toISOString(),
): RegistroDeResposta {
  const cadastrado = sessao.conteudo.criterios.find((item) => item.id === criterio);
  if (cadastrado === undefined) {
    throw new ErroDeRegistroDeResposta(
      'criterioInexistente',
      criterio,
      'não há critério com esse identificador no conteúdo da sessão',
    );
  }
  if (sessao.respostas.some((resposta) => resposta.criterio === criterio)) {
    throw new ErroDeRegistroDeResposta(
      'criterioJaRespondido',
      criterio,
      'já existe resposta registrada; substituir uma resposta é revisão',
    );
  }

  const resposta: Resposta = {
    criterio,
    valor: normalizarValor(cadastrado, valor),
    momento,
  };
  const respostas = [...sessao.respostas, resposta];

  return {
    sessao: {
      ...sessao,
      respostas,
      criteriosSemResposta: criteriosSemRespostaDe(respostas),
    },
    resposta,
    // Recálculo depois de cada resposta registrada (Seção 6 do design).
    posicoes: calcularPosicoes(sessao.conteudo, respostas),
    proximaPergunta: proximaPergunta({ conteudo: sessao.conteudo, respostas }),
  };
}

/**
 * Registra "não sei" para o critério.
 *
 * Atalho de leitura sobre {@link registrarResposta}: nada é exigido além do
 * critério, o que é a tradução literal do Requisito 3.2 — prosseguir sem pedir
 * justificativa nem estimativa.
 */
export function registrarRespostaDesconhecida(
  sessao: Sessao,
  criterio: Id,
  momento?: string,
): RegistroDeResposta {
  return registrarResposta(sessao, criterio, RESPOSTA_DESCONHECIDA, momento);
}

/**
 * Critérios respondidos como desconhecidos, na ordem do registro e sem
 * repetição (Requisito 3.4).
 *
 * Derivada das respostas em vez de acumulada: a lista é uma leitura do que está
 * registrado, e não um contador que a revisão precisaria corrigir.
 */
export function criteriosSemRespostaDe(respostas: readonly Resposta[]): Id[] {
  const criterios: Id[] = [];
  for (const resposta of respostas) {
    if (resposta.valor.tipo === 'desconhecida' && !criterios.includes(resposta.criterio)) {
      criterios.push(resposta.criterio);
    }
  }
  return criterios;
}

/** A resposta registrada para o critério, se houver. */
export function respostaDe(sessao: Sessao, criterio: Id): Resposta | undefined {
  return sessao.respostas.find((resposta) => resposta.criterio === criterio);
}

/**
 * Verifica se o valor informado é admissível para o critério e o põe na forma
 * final.
 *
 * Exposta porque a interface precisa da mesma verificação antes de tentar o
 * registro, e porque o motivo da recusa é o mesmo nos dois lugares.
 *
 * @throws {ErroDeRegistroDeResposta} quando o valor não é admissível.
 */
export function normalizarValor(criterio: Criterio, valor: ValorInformado): ValorRegistrado {
  const recusar = (motivo: MotivoDeRecusa, detalhe: string): never => {
    throw new ErroDeRegistroDeResposta(motivo, criterio.id, detalhe);
  };

  if (typeof valor === 'object' && !Array.isArray(valor) && 'tipo' in valor) {
    // "Não sei" não passa pelas verificações de valor cadastrado: é valor
    // implícito de todo critério, e não está no conteúdo (Requisito 3.1).
    if (valor.tipo === 'desconhecida') return RESPOSTA_DESCONHECIDA;
    return normalizarValor(criterio, valor.valores);
  }

  const informados = typeof valor === 'string' ? [valor] : [...valor];

  if (informados.length === 0) {
    recusar('semValor', 'nenhum valor informado; "não sei" é a forma de não escolher');
  }
  if (new Set(informados).size !== informados.length) {
    recusar('valorRepetido', 'o mesmo valor foi informado mais de uma vez');
  }
  if (informados.length > 1 && !criterio.permiteRespostaMultipla) {
    recusar(
      'respostaMultiplaNaoAdmitida',
      'o critério não admite mais de um valor na mesma resposta',
    );
  }

  const cadastrados = new Set(criterio.valores.map((item) => item.id));
  const forasteiros = informados.filter((item) => !cadastrados.has(item));
  if (forasteiros.length > 0) {
    recusar(
      'valorNaoPertenceAoCriterio',
      `valor não cadastrado para o critério: ${forasteiros.join(', ')}`,
    );
  }

  return { tipo: 'valores', valores: informados };
}

/**
 * Identificador da sessão. Usa o gerador do navegador quando disponível; o
 * recuo existe para ambientes sem `crypto.randomUUID`, e o valor só precisa
 * distinguir sessões dentro da mesma execução — não há persistência.
 */
function identificadorDeSessao(): Id {
  const geradorDisponivel =
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function';
  return geradorDisponivel
    ? globalThis.crypto.randomUUID()
    : `sessao-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
