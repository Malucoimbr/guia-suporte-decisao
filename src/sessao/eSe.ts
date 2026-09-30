/**
 * Visão "e se": recálculo do resultado por valor possível de um critério sem
 * resposta (Seções 4.3 e 5 do design; Requisito 3.5).
 *
 * `encerramento.ts` monta o resultado do que **está** registrado e declara a
 * lacuna: `criteriosSemResposta`, união dos critérios respondidos como "não
 * sei" com os das perguntas que ficaram na fila. Este módulo responde a
 * pergunta seguinte, e só ela — **se eu descobrisse esse valor, o que mudaria?**
 *
 * Para o critério escolhido, o Guia assume um valor admissível por vez,
 * recalcula o resultado inteiro e compara com o atual. O que se apresenta é a
 * **diferença**: quais estratégias mudariam de faixa em cada cenário. Quando
 * nenhum valor muda faixa alguma, isso também é resposta, e das mais úteis: a
 * informação não vale a busca. É o que a Seção 4.3 do design descreve como o
 * critério para o usuário decidir se vale a pena ir atrás do dado.
 *
 * ## Nada é alterado na sessão
 *
 * A sessão do usuário não é tocada. `selecao.ts`, `revisao.ts` e
 * `encerramento.ts` são funções puras sobre `{ conteudo, respostas }` justamente
 * para que o recálculo hipotético possa acontecer por cima, sem sessão nova e
 * sem desfazer nada. `EstadoDaColeta` é o tipo frouxo que permite isso — a
 * própria {@link Sessao} o atende, e um estado montado com respostas
 * hipotéticas também.
 *
 * ## As duas origens de lacuna
 *
 * O Requisito 3.5 vale para as duas, e elas diferem apenas em como a resposta
 * hipotética entra na lista:
 *
 * - **Respondido como "não sei"** — a resposta hipotética **substitui** a
 *   registrada, na posição que ela já ocupava, como faz a revisão. Substituir no
 *   lugar importa: o cenário precisa ser o de uma sessão conduzida com aquele
 *   valor, e não o de uma sessão que respondeu o critério por último.
 * - **Pergunta não apresentada** — a resposta hipotética é **acrescentada** ao
 *   fim, que é onde a pergunta seria respondida se a coleta tivesse seguido.
 *
 * ## Por que o cenário reconcilia as respostas posteriores
 *
 * Assumir um valor pode retirar o fundamento de respostas que vieram depois: se
 * o valor hipotético fixa Replatform, as quatro verificações de PaaS do Bloco F
 * ([Khouibiri2024]) não teriam sido feitas. O cenário usa
 * {@link reconciliarRespostas} pelo mesmo critério da revisão (Seção 8.2 do
 * design): o resultado hipotético é o de uma sessão iniciada já com aquele
 * valor. Sem isso, a visão "e se" mostraria um cenário que a sessão real nunca
 * produziria, e as respostas órfãs seguiriam acionando regras.
 *
 * **Decisão de projeto — resposta múltipla enumera valores, não combinações.**
 * Critério que admite mais de um valor por resposta teria 2ⁿ combinações
 * possíveis. Cada cenário assume **um** valor, que é o que o Requisito 3.5
 * pede ao falar de "cada valor possível daquele critério"; combinações ficam
 * para versões futuras, e o único critério com resposta múltipla hoje é
 * nenhum.
 *
 * O que este módulo não faz: apresentar a visão. A tela de resultado a oferece
 * sob demanda a partir da lista de critérios sem resposta, e quem a apresenta é
 * `ui/VisaoESeDoCriterio.tsx` (tarefa 8.1); aqui só se calcula.
 */
import type {
  Conteudo,
  Criterio,
  Faixa,
  Id,
  Resposta,
  ValorDeResposta,
} from '../dominio/tipos';
import { encerrarColeta, type ResultadoDaSessao } from './encerramento';
import { reconciliarRespostas } from './revisao';
import type { EstadoDaColeta } from './selecao';
import { normalizarValor } from './sessao';

/** De onde vem a lacuna de informação do critério. */
export type OrigemDaLacuna =
  /** O critério foi respondido como "não sei" (Requisito 3.4). */
  | 'respostaDesconhecida'
  /** A pergunta continuava aplicável quando a coleta parou. */
  | 'perguntaNaoApresentada'
  /**
   * Nenhuma pergunta aplicável investiga o critério: ele saiu de circulação
   * porque as estratégias que afeta já estão fixadas. Não entra na lista de
   * critérios sem resposta do resultado parcial — apontá-lo como lacuna seria
   * falso —, mas a visão "e se" continua calculável, e a resposta esperada é
   * que nenhum valor altere o resultado.
   */
  | 'foraDeCirculacao';

/** Critério sem resposta para o qual a visão "e se" pode ser oferecida. */
export interface LacunaDeInformacao {
  criterio: Criterio;
  origem: OrigemDaLacuna;
}

/** Estratégia que mudaria de faixa no cenário hipotético. */
export interface MudancaDeFaixa {
  estrategia: Id;
  /** Faixa com o resultado atual. */
  de: Faixa;
  /** Faixa se o critério tivesse o valor assumido. */
  para: Faixa;
}

/**
 * O resultado como seria se o critério tivesse um valor determinado.
 *
 * `resultado` é o quadro completo — as três faixas com as regras que justificam
 * cada posição —, de modo que a interface pode mostrar o motivo da mudança sem
 * recalcular nada. `mudancasDeFaixa` é a diferença, que é o que o Requisito 3.5
 * pede apresentar.
 */
export interface CenarioHipotetico {
  /** Valor assumido, com o rótulo apresentado ao usuário. */
  valor: ValorDeResposta;
  /** A resposta que o cenário assume, sem entrar na sessão do usuário. */
  respostaHipotetica: Resposta;
  /**
   * Respostas que a sessão perderia com esse valor, porque a pergunta que as
   * colheu não teria sido apresentada.
   */
  respostasInvalidadas: Resposta[];
  resultado: ResultadoDaSessao;
  /** Estratégias que mudariam de faixa, na ordem de apresentação atual. */
  mudancasDeFaixa: MudancaDeFaixa[];
  /** Estratégias recomendadas no cenário, por saldo decrescente. */
  recomendadas: Id[];
  alteraAsFaixas: boolean;
  /**
   * As mesmas estratégias seguem recomendadas, em outra ordem de prioridade.
   * Sinal mais fraco do que a mudança de faixa, e por isso separado: o saldo
   * não é exibido como número (Seção 5.2 do design), mas a ordem é.
   */
  alteraAOrdemDasRecomendadas: boolean;
  /** Alguma das duas diferenças acima. */
  alteraOResultado: boolean;
}

/**
 * A visão "e se" de um critério: um cenário por valor possível, com a diferença
 * de cada um em relação ao resultado atual (Requisito 3.5).
 */
export interface VisaoESe {
  criterio: Id;
  origem: OrigemDaLacuna;
  /** O resultado com o que está registrado, base da comparação. */
  resultadoAtual: ResultadoDaSessao;
  /** Estratégias recomendadas hoje, por saldo decrescente. */
  recomendadasAtuais: Id[];
  /** Um cenário por valor admissível, na ordem do cadastro. */
  cenarios: CenarioHipotetico[];
  /** Valores que mudariam algo. */
  valoresQueAlteramOResultado: Id[];
  /** Valores que não mudariam nada — informação útil, não ausência dela. */
  valoresSemEfeito: Id[];
  algumValorAlteraOResultado: boolean;
  /** Presente quando nenhum valor possível altera o resultado. */
  declaracaoSemEfeito?: string;
}

/**
 * Declaração exibida quando nenhum valor possível do critério altera o
 * resultado.
 *
 * Fica no mecanismo, e não no conteúdo editável, porque não vem da literatura:
 * é a constatação de que a informação ausente não move estratégia alguma. É o
 * que a Seção 4.3 do design entende por permitir ao usuário decidir se vale a
 * pena ir buscar o dado — aqui, não vale.
 */
export const DECLARACAO_SEM_EFEITO =
  'Nenhum valor possível deste critério altera as estratégias recomendadas: buscar essa informação não muda o resultado.';

/** Por que a visão "e se" não pode ser calculada. */
export type MotivoDeRecusaDeVisaoESe =
  /** O critério não está cadastrado no conteúdo. */
  | 'criterioInexistente'
  /**
   * O critério já tem valor registrado. Não é lacuna: alterar uma resposta
   * conhecida é revisão (Requisito 1.5, `revisao.ts`), e a visão "e se" existe
   * para o que não se sabe (Requisito 3.5).
   */
  | 'criterioComRespostaRegistrada'
  /** O critério não tem valor admissível cadastrado: não há cenário a montar. */
  | 'criterioSemValoresCadastrados';

/** Visão "e se" recusada. Traz o motivo em código, além da mensagem legível. */
export class ErroDeVisaoESe extends Error {
  readonly motivo: MotivoDeRecusaDeVisaoESe;
  readonly criterio: Id;

  constructor(motivo: MotivoDeRecusaDeVisaoESe, criterio: Id, detalhe: string) {
    super(`Visão "e se" indisponível para o critério "${criterio}": ${detalhe}`);
    this.name = 'ErroDeVisaoESe';
    this.motivo = motivo;
    this.criterio = criterio;
  }
}

/**
 * Critérios sem resposta que admitem visão "e se", na ordem em que o resultado
 * parcial os apresenta: primeiro os respondidos como "não sei", depois os das
 * perguntas que ficaram na fila.
 *
 * É a lista que a tela de resultado oferece para o usuário pedir a visão sob
 * demanda. Critério sem valor cadastrado fica de fora, porque não há cenário a
 * montar.
 */
export function lacunasDeInformacao(estado: EstadoDaColeta): LacunaDeInformacao[] {
  const resultado = encerrarColeta(estado);

  return resultado.criteriosSemResposta
    .map((criterio) => estado.conteudo.criterios.find((item) => item.id === criterio))
    .filter((criterio): criterio is Criterio => criterio !== undefined && criterio.valores.length > 0)
    .map((criterio) => ({
      criterio,
      origem: resultado.criteriosDeclaradosDesconhecidos.includes(criterio.id)
        ? ('respostaDesconhecida' as const)
        : ('perguntaNaoApresentada' as const),
    }));
}

/** O que a visão "e se" aceita ajustar. Existe para o teste. */
export interface OpcoesDeVisaoESe {
  /**
   * Momento atribuído à resposta hipotética, em ISO 8601. Sem efeito sobre o
   * cálculo: serve à exibição e a manter a comparação estável no teste. Ausente,
   * herda o momento da resposta substituída ou da última registrada.
   */
  momento?: string;
}

/**
 * Calcula a visão "e se" de um critério sem resposta (Requisito 3.5).
 *
 * Para cada valor admissível do critério, monta o estado que a sessão teria com
 * aquele valor — substituindo o "não sei" ou acrescentando a resposta que a
 * pergunta não colheu —, reconcilia as respostas posteriores, recalcula o
 * resultado e compara com o atual. Não altera o estado recebido.
 *
 * @throws {ErroDeVisaoESe} quando o critério não existe no conteúdo, quando já
 * tem valor registrado — aí a operação é revisão, não visão "e se" — ou quando
 * não tem valor admissível cadastrado.
 */
export function visaoESe(
  estado: EstadoDaColeta,
  criterio: Id,
  opcoes: OpcoesDeVisaoESe = {},
): VisaoESe {
  const cadastrado = estado.conteudo.criterios.find((item) => item.id === criterio);
  if (cadastrado === undefined) {
    throw new ErroDeVisaoESe(
      'criterioInexistente',
      criterio,
      'não há critério com esse identificador no conteúdo da sessão',
    );
  }

  const registrada = estado.respostas.find((resposta) => resposta.criterio === criterio);
  if (registrada !== undefined && registrada.valor.tipo === 'valores') {
    throw new ErroDeVisaoESe(
      'criterioComRespostaRegistrada',
      criterio,
      'o critério tem valor registrado; alterar resposta conhecida é revisão',
    );
  }
  if (cadastrado.valores.length === 0) {
    throw new ErroDeVisaoESe(
      'criterioSemValoresCadastrados',
      criterio,
      'não há valor admissível cadastrado para montar cenário',
    );
  }

  const resultadoAtual = encerrarColeta(estado);
  const faixasAtuais = faixasPorEstrategia(resultadoAtual);
  const recomendadasAtuais = resultadoAtual.recomendadas.map((posicao) => posicao.estrategia);
  const momento = opcoes.momento ?? momentoDeReferencia(estado, registrada);

  const cenarios = cadastrado.valores.map((valor) =>
    montarCenario({
      estado,
      criterio: cadastrado,
      valor,
      registrada,
      momento,
      faixasAtuais,
      recomendadasAtuais,
    }),
  );

  const valoresQueAlteramOResultado = cenarios
    .filter((cenario) => cenario.alteraOResultado)
    .map((cenario) => cenario.valor.id);
  const valoresSemEfeito = cenarios
    .filter((cenario) => !cenario.alteraOResultado)
    .map((cenario) => cenario.valor.id);
  const algumValorAlteraOResultado = valoresQueAlteramOResultado.length > 0;

  return {
    criterio,
    origem: origemDaLacuna(resultadoAtual, criterio, registrada),
    resultadoAtual,
    recomendadasAtuais,
    cenarios,
    valoresQueAlteramOResultado,
    valoresSemEfeito,
    algumValorAlteraOResultado,
    ...(algumValorAlteraOResultado ? {} : { declaracaoSemEfeito: DECLARACAO_SEM_EFEITO }),
  };
}

/**
 * Visão "e se" de todos os critérios sem resposta, na ordem do resultado
 * parcial.
 *
 * A tela de resultado oferece uma por vez, sob demanda; esta função existe para
 * quem precisa do conjunto — o teste, e o eventual resumo de "onde vale buscar
 * informação".
 */
export function visoesESe(estado: EstadoDaColeta, opcoes: OpcoesDeVisaoESe = {}): VisaoESe[] {
  return lacunasDeInformacao(estado).map((lacuna) =>
    visaoESe(estado, lacuna.criterio.id, opcoes),
  );
}

/** Monta um cenário: um valor assumido, o resultado que sairia dele e a diferença. */
function montarCenario(entrada: {
  estado: EstadoDaColeta;
  criterio: Criterio;
  valor: ValorDeResposta;
  registrada: Resposta | undefined;
  momento: string;
  faixasAtuais: ReadonlyMap<Id, Faixa>;
  recomendadasAtuais: readonly Id[];
}): CenarioHipotetico {
  const { estado, criterio, valor, registrada, momento, faixasAtuais, recomendadasAtuais } =
    entrada;

  const respostaHipotetica: Resposta = {
    criterio: criterio.id,
    valor: normalizarValor(criterio, valor.id),
    momento,
  };

  // Substitui no lugar quando havia "não sei"; acrescenta ao fim quando a
  // pergunta não foi apresentada. Nos dois casos o cenário reproduz a ordem em
  // que a sessão teria colhido a resposta.
  const candidatas =
    registrada === undefined
      ? [...estado.respostas, respostaHipotetica]
      : estado.respostas.map((resposta) =>
          resposta.criterio === criterio.id ? respostaHipotetica : resposta,
        );

  const { mantidas, respostasInvalidadas } = reconciliarPreservando(
    estado.conteudo,
    candidatas,
    respostaHipotetica,
  );

  const resultado = encerrarColeta({ conteudo: estado.conteudo, respostas: mantidas });
  const mudancasDeFaixa = diferencaDeFaixas(faixasAtuais, faixasPorEstrategia(resultado));
  const recomendadas = resultado.recomendadas.map((posicao) => posicao.estrategia);

  const alteraAsFaixas = mudancasDeFaixa.length > 0;
  // Só interessa como sinal quando o conjunto é o mesmo: com faixas diferentes,
  // a mudança de faixa já é o que se apresenta.
  const alteraAOrdemDasRecomendadas =
    !alteraAsFaixas && !mesmaSequencia(recomendadasAtuais, recomendadas);

  return {
    valor,
    respostaHipotetica,
    respostasInvalidadas,
    resultado,
    mudancasDeFaixa,
    recomendadas,
    alteraAsFaixas,
    alteraAOrdemDasRecomendadas,
    alteraOResultado: alteraAsFaixas || alteraAOrdemDasRecomendadas,
  };
}

/**
 * Reconcilia as candidatas e garante que a resposta hipotética permaneça.
 *
 * A reconciliação descarta resposta cuja pergunta deixou de ser apresentável, e
 * é o que faz o cenário equivaler a uma sessão conduzida com o valor assumido.
 * A própria resposta hipotética é exceção declarada: se a pergunta do critério
 * saiu de circulação — porque as estratégias que ela afeta já estão fixadas —,
 * descartá-la devolveria o resultado atual sem dizer por quê. Preservá-la faz o
 * cenário responder o que de fato acontece: o valor é assumido, as regras que
 * dependem dele são avaliadas, e nenhuma consegue mover estratégia fixada.
 */
function reconciliarPreservando(
  conteudo: Conteudo,
  candidatas: readonly Resposta[],
  respostaHipotetica: Resposta,
): { mantidas: Resposta[]; respostasInvalidadas: Resposta[] } {
  const { mantidas, invalidadas } = reconciliarRespostas(conteudo, candidatas);
  if (mantidas.includes(respostaHipotetica)) {
    return { mantidas, respostasInvalidadas: invalidadas };
  }

  const posicao = candidatas.indexOf(respostaHipotetica);
  const comHipotetica = [...mantidas];
  // Reinserida na ordem original: as mantidas anteriores à hipotética não
  // dependem do valor dela, e as posteriores foram julgadas sem ela — o que é o
  // julgamento correto, já que a pergunta do critério não estava em circulação.
  comHipotetica.splice(
    contarMantidasAntes(candidatas, mantidas, posicao),
    0,
    respostaHipotetica,
  );

  return {
    mantidas: comHipotetica,
    respostasInvalidadas: invalidadas.filter((resposta) => resposta !== respostaHipotetica),
  };
}

/** Quantas das respostas anteriores à posição indicada sobreviveram à reconciliação. */
function contarMantidasAntes(
  candidatas: readonly Resposta[],
  mantidas: readonly Resposta[],
  posicao: number,
): number {
  return candidatas
    .slice(0, Math.max(posicao, 0))
    .filter((resposta) => mantidas.includes(resposta)).length;
}

/** Faixa de cada estratégia avaliada, na ordem de apresentação do resultado. */
function faixasPorEstrategia(resultado: ResultadoDaSessao): Map<Id, Faixa> {
  const faixas = new Map<Id, Faixa>();
  for (const posicao of resultado.posicoes) {
    faixas.set(posicao.estrategia, posicao.faixa);
  }
  return faixas;
}

/**
 * Estratégias cuja faixa difere entre o resultado atual e o hipotético.
 *
 * O grupo "não avaliada pelo Guia" não entra: a ausência de regra é propriedade
 * do conteúdo, não do cenário informado, e por isso é a mesma nos dois lados.
 */
function diferencaDeFaixas(
  atuais: ReadonlyMap<Id, Faixa>,
  hipoteticas: ReadonlyMap<Id, Faixa>,
): MudancaDeFaixa[] {
  const mudancas: MudancaDeFaixa[] = [];
  for (const [estrategia, de] of atuais) {
    const para = hipoteticas.get(estrategia);
    if (para !== undefined && para !== de) {
      mudancas.push({ estrategia, de, para });
    }
  }
  return mudancas;
}

/** As duas listas têm os mesmos itens na mesma ordem? */
function mesmaSequencia(a: readonly Id[], b: readonly Id[]): boolean {
  return a.length === b.length && a.every((item, indice) => item === b[indice]);
}

/**
 * Origem da lacuna do critério, derivada do resultado atual.
 *
 * `foraDeCirculacao` é o caso que o resultado parcial não lista: o critério não
 * foi respondido, mas nenhuma pergunta aplicável o investiga.
 */
function origemDaLacuna(
  resultado: ResultadoDaSessao,
  criterio: Id,
  registrada: Resposta | undefined,
): OrigemDaLacuna {
  if (registrada !== undefined) return 'respostaDesconhecida';
  return resultado.criteriosNaoPerguntados.includes(criterio)
    ? 'perguntaNaoApresentada'
    : 'foraDeCirculacao';
}

/**
 * Momento atribuído à resposta hipotética quando quem chama não informa um.
 *
 * Herda o momento da resposta substituída, ou o da última registrada, de modo
 * que o cenário não introduza um instante novo no que é apenas um cálculo. Sem
 * resposta alguma registrada, usa o instante atual — é o único caso em que o
 * valor não tem de onde ser derivado.
 */
function momentoDeReferencia(
  estado: EstadoDaColeta,
  registrada: Resposta | undefined,
): string {
  if (registrada !== undefined) return registrada.momento;
  const ultima = estado.respostas[estado.respostas.length - 1];
  return ultima?.momento ?? new Date().toISOString();
}
