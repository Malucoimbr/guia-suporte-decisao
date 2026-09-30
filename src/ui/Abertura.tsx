/**
 * Tela de abertura (tarefa 7.1; Requisito 4.1, Seções 1 e 2.4 do design).
 *
 * É a única tela exibida antes de qualquer pergunta, e existe por um motivo:
 * o usuário precisa saber o que o Guia se propõe a fazer, para quem ele foi
 * feito e sobre que evidência ele opera **antes** de responder qualquer coisa.
 * Daí as três declarações obrigatórias do Requisito 4.1 — público-alvo,
 * definição de PME adotada e o aviso de que o conteúdo decisório é provisório
 * porque a Rapid Review está em andamento.
 *
 * O texto é fixo aqui de propósito. Ele não é conteúdo decisório: não move
 * estratégia, não depende de regra e não é lido no início da sessão — ao
 * contrário, é o que o usuário lê **antes** de a sessão existir, e portanto
 * antes de haver conteúdo carregado (Requisito 5.2). As listas que dependem das
 * estratégias recomendadas ficam no encerramento e são conteúdo (tarefa 7.4).
 *
 * Acessibilidade: a tela é uma `section` rotulada pelo próprio título, os
 * títulos descem um nível por vez a partir do `h1` da aplicação, e o botão de
 * início é o único controle — nada de foco roubado na montagem.
 */

/** Identificador do título da abertura, usado para rotular a região. */
const ID_TITULO = 'abertura-titulo';

export interface AberturaProps {
  /**
   * Aciona a abertura da sessão, que carrega o conteúdo vigente e leva à
   * primeira pergunta (Requisito 1.1). Quem decide o que acontece é a
   * aplicação; esta tela apenas declara o escopo e sai da frente.
   */
  onIniciar: () => void;
}

export function Abertura({ onIniciar }: AberturaProps) {
  return (
    <section className="abertura" aria-labelledby={ID_TITULO}>
      <h2 id={ID_TITULO}>Antes de começar</h2>

      <p>
        O Guia faz perguntas sobre uma aplicação e sobre o contexto da empresa e,
        ao final, apresenta as estratégias de migração recomendadas, possíveis e
        não recomendadas para o cenário informado, cada uma com o motivo e o
        estudo que a sustenta. A avaliação é de <strong>uma aplicação por
        sessão</strong>.
      </p>

      <section aria-labelledby="abertura-publico">
        <h3 id="abertura-publico">A quem o Guia se destina</h3>
        <p>
          Gestores de TI, proprietários, administradores e demais tomadores de
          decisão de pequenas e médias empresas que avaliam migrar uma aplicação
          para a nuvem. Nenhuma pergunta exige dado de medição contínua nem
          inventário automatizado; onde a informação não estiver disponível, a
          resposta <q>não sei</q> está sempre à disposição.
        </p>
      </section>

      <section aria-labelledby="abertura-pme">
        <h3 id="abertura-pme">Definição de PME adotada</h3>
        <p>
          Empresa independente de outras com menos de 250 funcionários. É a
          definição de [RoyPatil2023], única fonte do corpus a definir o termo.
          Parte da evidência de custo e de risco vem de organizações acima desse
          porte, e as estratégias sustentadas apenas por essa evidência aparecem
          marcadas no resultado.
        </p>
      </section>

      <section aria-labelledby="abertura-provisorio">
        <h3 id="abertura-provisorio">O conteúdo decisório é provisório</h3>
        <p>
          As regras aplicadas decorrem de uma revisão da literatura em
          andamento: a Rapid Review selecionou 17 estudos primários publicados
          entre 2020 e 2026, mas a síntese por categoria temática ainda não foi
          escrita. O conteúdo em uso é a melhor aproximação disponível,
          produzida por leitura direta dos artigos, e pode mudar conforme a
          revisão avança — inclusive as recomendações que esta sessão produzir.
        </p>
      </section>

      <p>
        <button type="button" className="acao-principal" onClick={onIniciar}>
          Iniciar a avaliação
        </button>
      </p>
    </section>
  );
}
