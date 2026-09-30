/**
 * Seleção da próxima pergunta aplicável (Seção 4 do design; Requisitos 1.1,
 * 1.2 e 1.3).
 *
 * O mecanismo de sessão não contém conhecimento sobre migração: o catálogo de
 * perguntas, a ordem dos blocos e as condições de exibição são conteúdo
 * editável (Seção 2.2 do design). Este módulo responde uma pergunta só — dado o
 * que a sessão já registrou, qual é a próxima pergunta a apresentar? — e
 * consome `posicoes.ts` apenas para saber quais estratégias já saíram de
 * circulação.
 *
 * Quatro coisas decidem se uma pergunta é apresentada:
 *
 * - **Ordem.** Bloco A a F e, dentro do bloco, o campo `ordem`. O princípio é o
 *   da Seção 4: o que mais restringe vem primeiro, de modo que a sessão não
 *   pergunte sobre compatibilidade de banco de dados a quem já declarou que a
 *   aplicação será desativada.
 * - **Já respondida.** Pergunta cujo critério já tem resposta registrada não é
 *   reapresentada — inclusive quando a resposta foi "não sei", que é resposta
 *   registrada e faz a sessão prosseguir sem exigir justificativa nem
 *   estimativa (Requisito 3.2).
 * - **Condição de exibição.** Só aparece quando as condições declaradas para a
 *   pergunta são satisfeitas pelas respostas já registradas (Requisito 1.3) e
 *   quando as estratégias que ela exige em jogo continuam em jogo — é o que
 *   sustenta o Bloco F, apresentado somente se Replatform com alvo PaaS ainda
 *   estiver viável.
 * - **Economia de perguntas.** Pergunta cujas estratégias afetadas já estão
 *   todas fixadas sai de circulação: ela não é mais capaz de alterar o
 *   resultado (Requisito 1.4, Seção 4.2 do design). Fixada quer dizer eliminada
 *   por precondição, e pontos não tiram a estratégia de "não recomendada".
 *
 * Como o catálogo é finito, nenhuma pergunta repete e a exclusão só depende de
 * respostas já registradas, a coleta sempre termina: ausência de próxima
 * pergunta é o critério de encerramento (Seção 4.2 do design).
 *
 * Funções puras, sem leitura de arquivo e sem estado: as mesmas respostas
 * contra o mesmo conteúdo devolvem sempre a mesma seleção. É o que permite à
 * revisão de resposta recalcular as perguntas seguintes sem desfazer nada
 * (Requisito 1.5).
 */
import { avaliarCondicao, indexarRespostasPorCriterio } from '../dominio/condicoes';
import { calcularPosicoes, estrategiaFixada } from '../dominio/posicoes';
import type { Bloco, Conteudo, Id, Pergunta, Resposta } from '../dominio/tipos';

/**
 * O que a seleção precisa saber da sessão: o conteúdo vigente e as respostas
 * registradas.
 *
 * A {@link Sessao} atende a esta forma, de modo que as tarefas seguintes —
 * registro de resposta, encerramento e revisão — passam a própria sessão. O
 * tipo é mais frouxo do que `Sessao` de propósito: o recálculo "e se"
 * (Requisito 3.5) precisa avaliar respostas hipotéticas sem construir sessão
 * nova.
 */
export interface EstadoDaColeta {
  conteudo: Conteudo;
  respostas: readonly Resposta[];
}

/** Ordem dos blocos no fluxo do questionário (Seção 4 do design). */
const ORDEM_DOS_BLOCOS: Readonly<Record<Bloco, number>> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
};

/** Por que uma pergunta não é apresentada. */
export type MotivoDeExclusao =
  /** O critério investigado já tem resposta registrada, inclusive "não sei". */
  | 'jaRespondida'
  /** A condição sobre as respostas registradas não está satisfeita. */
  | 'condicaoSobreRespostasNaoSatisfeita'
  /** Alguma estratégia que a pergunta exige em jogo já está fixada. */
  | 'estrategiaExigidaFixada'
  /** Todas as estratégias afetadas já estão fixadas: a pergunta não muda nada. */
  | 'estrategiasAfetadasFixadas'
  /** A pergunta não declara estratégia afetada: não é capaz de mudar nada. */
  | 'semEstrategiaAfetada';

/**
 * Aplicabilidade de uma pergunta, com o motivo quando ela não é apresentada.
 *
 * O motivo não é exibido ao usuário: serve à interface, que precisa saber
 * distinguir o que já foi respondido do que saiu de circulação, e ao teste, que
 * afirma qual das quatro condições retirou a pergunta.
 */
export interface AplicabilidadeDePergunta {
  pergunta: Pergunta;
  aplicavel: boolean;
  motivo?: MotivoDeExclusao;
}

/**
 * Ordena as perguntas na ordem de apresentação: bloco e, dentro dele, `ordem`.
 *
 * Não altera a lista recebida. A ordenação do JavaScript é estável, de modo que
 * perguntas com o mesmo bloco e a mesma ordem — divergência que a verificação
 * de consistência acusa — mantêm a ordem do cadastro em vez de trocarem de
 * lugar entre execuções.
 */
export function ordenarPerguntas(perguntas: readonly Pergunta[]): Pergunta[] {
  return [...perguntas].sort(
    (a, b) =>
      ORDEM_DOS_BLOCOS[a.bloco] - ORDEM_DOS_BLOCOS[b.bloco] || a.ordem - b.ordem,
  );
}

/**
 * Estratégias fixadas em "não recomendada" por precondição falhada.
 *
 * Precondição indeterminada — critério respondido como "não sei" ou ainda sem
 * resposta — não fixa nada: na dúvida a estratégia permanece disponível
 * (Requisito 3.3, Seção 4.3 do design). Estratégia que nenhuma regra menciona
 * não é pontuada e portanto nunca aparece aqui, o que a mantém em jogo para
 * efeito de seleção de pergunta.
 */
export function estrategiasFixadas(
  conteudo: Conteudo,
  respostas: readonly Resposta[],
): Set<Id> {
  const fixadas = new Set<Id>();
  for (const posicao of calcularPosicoes(conteudo, respostas)) {
    if (estrategiaFixada(posicao)) fixadas.add(posicao.estrategia);
  }
  return fixadas;
}

/**
 * Avalia se uma pergunta é apresentável diante do estado da coleta.
 *
 * `fixadas` é opcional para quem avalia uma pergunta só; `perguntasAplicaveis`
 * calcula o conjunto uma vez e o repassa, porque a posição das estratégias não
 * muda entre perguntas do mesmo instante da sessão.
 */
export function avaliarAplicabilidade(
  pergunta: Pergunta,
  estado: EstadoDaColeta,
  fixadas: ReadonlySet<Id> = estrategiasFixadas(estado.conteudo, estado.respostas),
): AplicabilidadeDePergunta {
  const naoAplicavel = (motivo: MotivoDeExclusao): AplicabilidadeDePergunta => ({
    pergunta,
    aplicavel: false,
    motivo,
  });

  const porCriterio = indexarRespostasPorCriterio(estado.respostas);
  if (porCriterio.has(pergunta.criterio)) return naoAplicavel('jaRespondida');

  // Pergunta que não afeta estratégia alguma não é capaz de alterar o
  // resultado, e o Requisito 1.4 manda encerrar a coleta nesse caso em vez de
  // perguntar por perguntar. A verificação de consistência do conteúdo acusa
  // pergunta sem regra associada; aqui a seleção apenas não a apresenta.
  if (pergunta.estrategiasAfetadas.length === 0) {
    return naoAplicavel('semEstrategiaAfetada');
  }

  const condicao = pergunta.condicaoDeExibicao;
  if (condicao?.respostas !== undefined) {
    // Só "satisfeita" apresenta a pergunta: o Requisito 1.3 exige que as
    // condições declaradas sejam satisfeitas **pelas respostas já
    // registradas**, e condição indeterminada é justamente a que depende de
    // critério ainda sem resposta ou respondido como "não sei".
    const avaliacao = avaliarCondicao(condicao.respostas, porCriterio);
    if (avaliacao.resultado !== 'satisfeita') {
      return naoAplicavel('condicaoSobreRespostasNaoSatisfeita');
    }
  }

  // Exigência declarada no conteúdo: as estratégias listadas precisam continuar
  // em jogo. É a leitura literal do atributo, e a que o Bloco F usa — as quatro
  // verificações de PaaS de [Khouibiri2024] só têm sentido se Replatform ainda
  // estiver viável. Com lista de um item, a leitura coincide com qualquer outra;
  // com mais de um, exigir todas é o que o atributo declara, e o caso "basta uma
  // continuar em jogo" já é coberto pela economia de perguntas abaixo.
  if (condicao?.estrategiasEmJogo?.some((estrategia) => fixadas.has(estrategia)) === true) {
    return naoAplicavel('estrategiaExigidaFixada');
  }

  // Economia de perguntas (Requisito 1.4, Seção 4.2 do design): se todas as
  // estratégias da coluna "estratégias afetadas" já foram eliminadas por
  // precondição, nenhuma resposta a esta pergunta muda o resultado.
  if (pergunta.estrategiasAfetadas.every((estrategia) => fixadas.has(estrategia))) {
    return naoAplicavel('estrategiasAfetadasFixadas');
  }

  return { pergunta, aplicavel: true };
}

/**
 * Perguntas apresentáveis agora, na ordem de apresentação.
 *
 * Serve à interface, que mostra uma por vez, e ao encerramento: lista vazia
 * significa que nenhuma pergunta pendente é capaz de alterar as estratégias
 * recomendadas.
 */
export function perguntasAplicaveis(estado: EstadoDaColeta): Pergunta[] {
  const fixadas = estrategiasFixadas(estado.conteudo, estado.respostas);
  return ordenarPerguntas(estado.conteudo.perguntas).filter(
    (pergunta) => avaliarAplicabilidade(pergunta, estado, fixadas).aplicavel,
  );
}

/**
 * Próxima pergunta a apresentar, ou `undefined` quando não resta pergunta
 * capaz de alterar o resultado.
 *
 * Na primeira chamada de uma sessão sem resposta alguma, devolve a primeira
 * pergunta do Bloco A (Requisito 1.1); depois de cada resposta registrada,
 * devolve a seguinte considerando tudo que já foi registrado (Requisito 1.2).
 */
export function proximaPergunta(estado: EstadoDaColeta): Pergunta | undefined {
  const fixadas = estrategiasFixadas(estado.conteudo, estado.respostas);
  return ordenarPerguntas(estado.conteudo.perguntas).find(
    (pergunta) => avaliarAplicabilidade(pergunta, estado, fixadas).aplicavel,
  );
}

/**
 * Diagnóstico de todo o catálogo, na ordem de apresentação: cada pergunta com o
 * seu veredito e, quando excluída, o motivo.
 *
 * Não é usado pela condução da sessão. Existe para a interface e para o teste
 * poderem afirmar **por que** uma pergunta não apareceu, em lugar de constatar
 * apenas a ausência.
 */
export function diagnosticarPerguntas(estado: EstadoDaColeta): AplicabilidadeDePergunta[] {
  const fixadas = estrategiasFixadas(estado.conteudo, estado.respostas);
  return ordenarPerguntas(estado.conteudo.perguntas).map((pergunta) =>
    avaliarAplicabilidade(pergunta, estado, fixadas),
  );
}
