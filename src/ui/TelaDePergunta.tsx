/**
 * Tela de pergunta (tarefa 7.2; Requisitos 1.1, 1.2, 3.1 e 3.2; Seções 2.3 e
 * 4.3 do design).
 *
 * Uma pergunta por vez, com os valores de resposta **cadastrados no critério** e
 * a opção "não sei" sempre presente. A distinção importa: os valores vêm do
 * conteúdo editável e mudam quando a Rapid Review avança (Requisito 5.1); "não
 * sei" não está no conteúdo e nunca estará — é valor implícito de todo critério
 * (Requisito 3.1), e por isso é a interface que o oferece, em toda pergunta,
 * sem depender de cadastro.
 *
 * O controle usado segue o critério, não a estética: `permiteRespostaMultipla`
 * declara que mais de um valor cabe na mesma resposta, e é o que decide entre
 * botões de opção e caixas de seleção. A exigência de [Mwilu2024] — valores que
 * não precisam ser mutuamente exclusivos nem exaustivos — só se cumpre se o
 * controle acompanhar o cadastro.
 *
 * "Não sei" é exclusivo mesmo em critério de resposta múltipla: declarar que não
 * se dispõe da informação e ao mesmo tempo escolher um valor é contradição, e o
 * registro recusaria a mistura. Escolhido "não sei", a sessão prossegue sem
 * pedir justificativa nem estimativa (Requisito 3.2) — daí não haver campo de
 * texto algum nesta tela.
 *
 * A tela não registra nada: entrega o valor escolhido a quem conduz a sessão, e
 * é a sessão que registra a resposta e seleciona a pergunta seguinte
 * (Requisito 1.2). O tipo devolvido é o `ValorRegistrado` do domínio, de modo
 * que a tela não conhece o mecanismo de registro.
 *
 * Acessibilidade: os valores ficam num `fieldset` rotulado pela `legend`, que é
 * o próprio texto da pergunta — quem usa leitor de tela ouve a pergunta ao
 * entrar no grupo, não apenas o rótulo do valor. Cada controle tem `label`
 * associado por `htmlFor`. Na troca de pergunta o foco vai ao grupo, porque o
 * conteúdo da tela muda sem que a página mude, e quem navega por teclado
 * continuaria no botão de confirmação da pergunta anterior. O formulário
 * confirma pelo botão ou por Enter, e o botão só habilita com escolha feita:
 * ausência de escolha não é "não sei".
 */
import { useEffect, useRef, useState } from 'react';
import type { Criterio, Id, Pergunta, ValorRegistrado } from '../dominio/tipos';

/** Identificadores fixos, usados para rotular e descrever o grupo. */
const ID_LEGENDA = 'pergunta-texto';
const ID_DICA_NAO_SEI = 'pergunta-dica-nao-sei';

export interface TelaDePerguntaProps {
  pergunta: Pergunta;
  /**
   * Critério investigado pela pergunta. É dele que saem os valores admissíveis
   * e a declaração de resposta múltipla.
   */
  criterio: Criterio;
  /**
   * Recebe o valor escolhido — um ou mais valores cadastrados, ou "não sei".
   * Quem conduz a sessão registra a resposta e decide a pergunta seguinte.
   */
  onResponder: (valor: ValorRegistrado) => void;
}

export function TelaDePergunta({ pergunta, criterio, onResponder }: TelaDePerguntaProps) {
  const [selecao, setSelecao] = useState<ValorRegistrado>();
  /**
   * Pergunta a que a seleção corrente pertence. Trocada a pergunta, a seleção é
   * descartada no mesmo passo de renderização — sem isso, a escolha da pergunta
   * anterior apareceria marcada na seguinte.
   */
  const [perguntaDaSelecao, setPerguntaDaSelecao] = useState<Id>(pergunta.id);
  const grupo = useRef<HTMLFieldSetElement>(null);
  const jaMontou = useRef(false);

  if (perguntaDaSelecao !== pergunta.id) {
    setPerguntaDaSelecao(pergunta.id);
    setSelecao(undefined);
  }

  useEffect(() => {
    // Na montagem o foco pertence a quem trocou de fase (a casca leva ao título
    // da coleta); daqui em diante, cada nova pergunta chama o foco para si.
    if (jaMontou.current) {
      grupo.current?.focus();
    } else {
      jaMontou.current = true;
    }
  }, [pergunta.id]);

  const escolhidos = selecao?.tipo === 'valores' ? selecao.valores : [];
  const naoSei = selecao?.tipo === 'desconhecida';
  const respostaMultipla = criterio.permiteRespostaMultipla;

  function escolher(valor: Id, marcado: boolean) {
    if (!respostaMultipla) {
      setSelecao({ tipo: 'valores', valores: [valor] });
      return;
    }
    // Marcar um valor descarta "não sei", porque `escolhidos` está vazio quando
    // a seleção corrente é a desconhecida.
    const valores = marcado
      ? [...escolhidos, valor]
      : escolhidos.filter((item) => item !== valor);
    setSelecao(valores.length === 0 ? undefined : { tipo: 'valores', valores });
  }

  function confirmar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (selecao === undefined) return;
    onResponder(selecao);
  }

  const tipoDeControle = respostaMultipla ? 'checkbox' : 'radio';

  return (
    <form className="pergunta" onSubmit={confirmar}>
      {/* tabIndex −1 torna o grupo alvo de foco programático na troca de
          pergunta, sem entrar na ordem de tabulação. */}
      <fieldset
        ref={grupo}
        tabIndex={-1}
        aria-labelledby={ID_LEGENDA}
        aria-describedby={ID_DICA_NAO_SEI}
      >
        <legend id={ID_LEGENDA}>{pergunta.texto}</legend>

        {respostaMultipla ? (
          <p className="pergunta-instrucao">Pode marcar mais de uma opção.</p>
        ) : null}

        <ul className="pergunta-opcoes">
          {criterio.valores.map((valor) => {
            const id = `${pergunta.id}-${valor.id}`;
            return (
              <li key={valor.id}>
                <input
                  type={tipoDeControle}
                  id={id}
                  name={pergunta.criterio}
                  value={valor.id}
                  checked={escolhidos.includes(valor.id)}
                  onChange={(evento) => escolher(valor.id, evento.target.checked)}
                />
                <label htmlFor={id}>{valor.rotulo}</label>
              </li>
            );
          })}

          {/* "Não sei" fecha a lista e não vem do conteúdo (Requisito 3.1). */}
          <li className="pergunta-nao-sei">
            <input
              type={tipoDeControle}
              id={`${pergunta.id}-naoSei`}
              name={pergunta.criterio}
              checked={naoSei}
              onChange={(evento) =>
                setSelecao(evento.target.checked ? { tipo: 'desconhecida' } : undefined)
              }
            />
            <label htmlFor={`${pergunta.id}-naoSei`}>Não sei</label>
          </li>
        </ul>

        <p id={ID_DICA_NAO_SEI} className="pergunta-dica">
          Responder <q>não sei</q> não interrompe a avaliação e não pede
          justificativa: as regras que dependem desta informação deixam de ser
          aplicadas, sem descartar nenhuma estratégia, e o critério aparece no
          resultado como sem resposta.
        </p>
      </fieldset>

      <p>
        <button type="submit" className="acao-principal" disabled={selecao === undefined}>
          Responder e continuar
        </button>
      </p>
    </form>
  );
}
