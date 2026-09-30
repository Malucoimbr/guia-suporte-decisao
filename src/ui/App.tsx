/**
 * Casca da interface: abertura da sessão, condução da coleta e resultado
 * (tarefas 7.1 a 7.3; Requisitos 4.1, 1.1, 1.2, 1.4, 1.5 e 5.2).
 *
 * Três fases, e a passagem entre elas é a única decisão que mora aqui:
 *
 * - **Abertura**, que declara o escopo antes de qualquer pergunta.
 * - **Coleta**, que abre a sessão sobre o conteúdo vigente e conduz uma pergunta
 *   por vez — cada resposta registrada leva à pergunta seguinte selecionada pelo
 *   mecanismo (Requisito 1.2). É também a fase em que uma resposta já registrada
 *   é alterada (Requisito 1.5).
 * - **Resultado**, exibido quando nenhuma pergunta pendente é capaz de alterar as
 *   estratégias recomendadas (Requisito 1.4) ou quando o usuário pede o resultado
 *   antes do fim. Encerrar antes é sempre possível: o resultado sai do que já foi
 *   registrado e se declara parcial, com as perguntas que ficaram na fila
 *   apontadas como lacuna (Requisito 3.4).
 *
 * O conteúdo é lido no clique de início, não na montagem do componente: é o que
 * dá sentido ao Requisito 5.2 — alteração de conteúdo vale para as sessões
 * iniciadas depois, e cada sessão é conduzida contra a leitura que fez ao
 * abrir.
 *
 * Alterar uma resposta é operação do mecanismo, não da interface: `revisarResposta`
 * substitui o valor, descarta as respostas que só existiam por causa do valor
 * antigo e recalcula perguntas seguintes e posições. Esta casca apenas apresenta
 * o que sobrou e avisa o que a revisão custou — a alternativa, guardar a resposta
 * órfã, faria a sessão divergir de uma iniciada já com o valor novo.
 *
 * Acessibilidade: uma única região `main`, `h1` da aplicação acima das telas, e
 * o foco levado ao título da fase quando a fase muda, para que quem navega por
 * teclado ou leitor de tela não continue no controle que desapareceu. Dentro da
 * coleta, o foco na troca de pergunta é responsabilidade da tela de pergunta; o
 * título da fase de resultado é a própria tela que o traz ao foco.
 */
import { useEffect, useRef, useState } from 'react';
import { abrirSessao, registrarResposta } from '../sessao/sessao';
import { proximaPergunta } from '../sessao/selecao';
import { revisarResposta } from '../sessao/revisao';
import type {
  Conteudo,
  Criterio,
  Id,
  Pergunta,
  Resposta,
  Sessao,
  ValorRegistrado,
} from '../dominio/tipos';
import { Abertura } from './Abertura';
import { TelaDePergunta } from './TelaDePergunta';
import { TelaDeResultado, descricaoDaResposta, nomeDoCriterio } from './TelaDeResultado';

/** Sessão em curso, com o que a interface precisa saber para escolher a fase. */
interface Coleta {
  sessao: Sessao;
  /** Ausente quando nenhuma pergunta pendente pode alterar o resultado. */
  pergunta?: Pergunta;
  /**
   * O usuário pediu o resultado com perguntas ainda na fila. Preservado através
   * de uma revisão: quem pediu o resultado não é jogado de volta ao questionário
   * por ter alterado uma resposta.
   */
  encerradaPeloUsuario?: boolean;
  /** Pergunta cuja resposta está sendo alterada (Requisito 1.5). */
  emRevisao?: Pergunta;
  /** Respostas descartadas pela última revisão, para avisar o usuário. */
  respostasInvalidadas?: Resposta[];
}

/** Fase em exibição. A revisão acontece dentro da coleta, não em fase própria. */
type Fase = 'abertura' | 'coleta' | 'resultado';

export interface AppProps {
  /**
   * Conteúdo já carregado. Em produção fica ausente e a sessão lê o conteúdo
   * vigente; existe para o teste poder abrir a sessão sobre conteúdo montado à
   * mão.
   */
  conteudo?: Conteudo;
}

export function App({ conteudo }: AppProps = {}) {
  const [coleta, setColeta] = useState<Coleta>();
  const tituloDaColeta = useRef<HTMLHeadingElement>(null);
  const fase = faseDe(coleta);

  // A dependência é a fase, não a coleta: o foco vai ao título quando a fase
  // muda, e não a cada resposta registrada — do contrário cada resposta roubaria
  // o foco da pergunta seguinte.
  useEffect(() => {
    if (fase === 'coleta') {
      tituloDaColeta.current?.focus();
    }
  }, [fase]);

  function iniciar() {
    // A leitura do conteúdo acontece aqui, uma vez por sessão (Requisito 5.2).
    const sessao = abrirSessao(conteudo === undefined ? {} : { conteudo });
    setColeta({
      sessao,
      pergunta: proximaPergunta({
        conteudo: sessao.conteudo,
        respostas: sessao.respostas,
      }),
    });
  }

  /**
   * Registra a resposta da pergunta em exibição, ou substitui a resposta em
   * revisão, e passa ao que vem depois (Requisitos 1.2 e 1.5).
   *
   * Quem seleciona a pergunta seguinte é o mecanismo, que considera tudo que já
   * foi registrado; a interface apenas apresenta o que ele devolve, e a ausência
   * de pergunta seguinte significa coleta encerrada.
   */
  function responder(criterio: Criterio, valor: ValorRegistrado) {
    setColeta((atual) => {
      if (atual === undefined) return atual;

      if (atual.emRevisao !== undefined) {
        const revisao = revisarResposta(atual.sessao, criterio.id, valor);
        return {
          sessao: revisao.sessao,
          pergunta: revisao.proximaPergunta,
          encerradaPeloUsuario: atual.encerradaPeloUsuario,
          ...(revisao.respostasInvalidadas.length > 0
            ? { respostasInvalidadas: revisao.respostasInvalidadas }
            : {}),
        };
      }

      const registro = registrarResposta(atual.sessao, criterio.id, valor);
      return { sessao: registro.sessao, pergunta: registro.proximaPergunta };
    });
  }

  /** Abre a alteração da resposta de um critério já respondido (Requisito 1.5). */
  function revisar(criterio: Id) {
    setColeta((atual) => {
      if (atual === undefined) return atual;
      const pergunta = atual.sessao.conteudo.perguntas.find(
        (item) => item.criterio === criterio,
      );
      // Critério que nenhuma pergunta investiga não tem o que reapresentar; a
      // tela de resultado nem oferece o controle nesse caso.
      if (pergunta === undefined) return atual;
      return { ...atual, emRevisao: pergunta, respostasInvalidadas: undefined };
    });
  }

  function cancelarRevisao() {
    setColeta((atual) =>
      atual === undefined ? atual : { ...atual, emRevisao: undefined },
    );
  }

  /** Encerra a coleta antes do fim e apresenta o resultado parcial. */
  function encerrarAgora() {
    setColeta((atual) =>
      atual === undefined
        ? atual
        : { ...atual, encerradaPeloUsuario: true, emRevisao: undefined },
    );
  }

  function voltarAsPerguntas() {
    setColeta((atual) =>
      atual === undefined ? atual : { ...atual, encerradaPeloUsuario: false },
    );
  }

  /**
   * A pergunta em exibição com o critério que ela investiga. O critério vem do
   * conteúdo da sessão, não de uma segunda leitura: a sessão inteira é conduzida
   * contra a leitura que fez ao abrir (Requisito 5.2).
   */
  function telaDaPergunta(sessao: Sessao, pergunta: Pergunta) {
    const criterio = sessao.conteudo.criterios.find((item) => item.id === pergunta.criterio);
    if (criterio === undefined) {
      // A verificação de consistência do conteúdo (tarefa 2.3) acusa isso antes
      // de a sessão existir; se ainda assim acontecer, a interface diz o que
      // está faltando em vez de apresentar pergunta sem opção de resposta.
      return (
        <p>
          A pergunta <code>{pergunta.id}</code> investiga o critério{' '}
          <code>{pergunta.criterio}</code>, que não está cadastrado no conteúdo
          desta sessão.
        </p>
      );
    }
    return (
      <TelaDePergunta
        pergunta={pergunta}
        criterio={criterio}
        onResponder={(valor) => responder(criterio, valor)}
      />
    );
  }

  return (
    <main>
      <h1>Guia Prático de Suporte à Decisão</h1>
      <p>Escolha de estratégia de migração de aplicações para a nuvem em PMEs.</p>

      {coleta !== undefined && coleta.respostasInvalidadas !== undefined ? (
        // `role="status"` porque o aviso é consequência de uma ação do usuário e
        // precisa ser anunciado sem interromper o que ele está fazendo.
        <p className="aviso-revisao" role="status">
          A alteração descartou{' '}
          {coleta.respostasInvalidadas.length === 1
            ? 'uma resposta que só existia'
            : `${coleta.respostasInvalidadas.length} respostas que só existiam`}{' '}
          por causa do valor anterior:{' '}
          {coleta.respostasInvalidadas
            .map((resposta) => descricaoDaResposta(coleta.sessao.conteudo, resposta))
            .join('; ')}
          . Se a pergunta voltar a valer, ela será apresentada de novo.
        </p>
      ) : null}

      {coleta === undefined ? <Abertura onIniciar={iniciar} /> : null}

      {coleta !== undefined && fase === 'coleta' ? (
        <section className="coleta" aria-labelledby="coleta-titulo">
          {/* tabIndex −1 torna o título alvo de foco programático sem entrar na
              ordem de tabulação. */}
          <h2 id="coleta-titulo" tabIndex={-1} ref={tituloDaColeta}>
            Coleta de respostas
          </h2>

          {coleta.emRevisao === undefined ? (
            <>
              {coleta.pergunta === undefined
                ? null
                : telaDaPergunta(coleta.sessao, coleta.pergunta)}
              <p>
                {/* Encerrar antes do fim é sempre possível: o resultado sai do
                    que já foi registrado, declarado parcial (Requisito 3.4). */}
                <button type="button" onClick={encerrarAgora}>
                  Encerrar e ver o resultado parcial
                </button>
              </p>
            </>
          ) : (
            <>
              <p>
                Você está alterando a resposta sobre{' '}
                {nomeDoCriterio(coleta.sessao.conteudo, coleta.emRevisao.criterio)}. As
                perguntas seguintes e a posição de todas as estratégias são
                recalculadas.
              </p>
              {telaDaPergunta(coleta.sessao, coleta.emRevisao)}
              <p>
                <button type="button" onClick={cancelarRevisao}>
                  Cancelar a alteração
                </button>
              </p>
            </>
          )}
        </section>
      ) : null}

      {coleta !== undefined && fase === 'resultado' ? (
        <TelaDeResultado
          sessao={coleta.sessao}
          onRevisar={revisar}
          onVoltarAsPerguntas={voltarAsPerguntas}
        />
      ) : null}
    </main>
  );
}

/**
 * Fase em exibição.
 *
 * A revisão fica na fase de coleta de propósito: é uma pergunta sendo
 * apresentada de novo, e tratá-la como fase própria duplicaria a região, o
 * título e o foco sem que nada mudasse para o usuário.
 */
function faseDe(coleta: Coleta | undefined): Fase {
  if (coleta === undefined) return 'abertura';
  if (coleta.emRevisao !== undefined) return 'coleta';
  if (coleta.encerradaPeloUsuario === true || coleta.pergunta === undefined) {
    return 'resultado';
  }
  return 'coleta';
}
