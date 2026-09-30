/**
 * Visão «e se» de um critério sem resposta, apresentada sob demanda na tela de
 * resultado (tarefa 8.1; Requisito 3.5; Seções 2.3 e 4.3 do design).
 *
 * O resultado parcial diz **o que** ficou sem resposta. Esta seção responde a
 * pergunta seguinte, que é a que interessa a quem vai decidir se vale a pena ir
 * atrás do dado: **se eu descobrisse esse valor, o que mudaria?**
 *
 * Nada é calculado aqui. `visaoESe` monta um cenário por valor admissível do
 * critério — assumindo aquele valor, reconciliando as respostas que dependiam do
 * valor antigo e recalculando o resultado inteiro — e esta seção apresenta a
 * **diferença** de cada cenário: quais estratégias mudariam de faixa. Se alguma
 * decisão parecer estar neste arquivo, ela está no lugar errado.
 *
 * Três decisões de apresentação:
 *
 * - **A diferença vem antes do quadro completo.** O cenário hipotético traz o
 *   resultado inteiro, com as regras que justificam cada posição, mas repetir
 *   três faixas por valor possível afogaria o que o Requisito 3.5 pede: como as
 *   estratégias recomendadas mudariam. O que se mostra é a mudança de faixa, as
 *   recomendadas do cenário e o que a sessão perderia — o resto está a um clique
 *   de distância, alterando a resposta de verdade.
 * - **"Nada mudaria" é resposta, não silêncio.** O cenário sem diferença aparece
 *   escrito, e quando **nenhum** valor altera o resultado a seção abre com
 *   `DECLARACAO_SEM_EFEITO`: buscar essa informação não muda o que o Guia
 *   recomenda. É o critério da Seção 4.3 do design para o usuário decidir se a
 *   busca vale o esforço.
 * - **O custo do cenário fica visível.** Assumir um valor pode derrubar
 *   respostas que só existiam por causa do que estava registrado — as
 *   verificações de plataforma de [Khouibiri2024] são o caso concreto. O cenário
 *   declara quais respostas a sessão perderia, do mesmo modo que a casca declara
 *   o que uma revisão descartou.
 *
 * A sessão do usuário não é tocada: `visaoESe` é cálculo sobre respostas
 * hipotéticas, e sair desta seção não desfaz nem registra nada.
 *
 * Acessibilidade: os títulos continuam a descida da tela de resultado — a seção
 * é `h4` dentro do bloco `h3` do resultado parcial, e cada cenário é `h5` —, os
 * cenários e as mudanças de faixa são listas semânticas, e o efeito de cada
 * cenário está escrito no seu próprio título, sem depender de cor nem de
 * posição. O título recebe foco na montagem, porque a seção aparece no meio de
 * uma tela que já estava na frente do usuário.
 */
import { useEffect, useMemo, useRef } from 'react';
import { visaoESe, type CenarioHipotetico } from '../sessao/eSe';
import type { Conteudo, Id, Resposta, Sessao } from '../dominio/tipos';
import {
  ROTULO_DA_FAIXA,
  descricaoDaResposta,
  nomeDaEstrategia,
  nomeDoCriterio,
} from './TelaDeResultado';

export interface VisaoESeDoCriterioProps {
  /**
   * Identificador da região. É o alvo do `aria-controls` do controle que a
   * abriu, na tela de resultado.
   */
  id: string;
  /**
   * Sessão em curso. É a base da comparação e a fonte dos nomes exibidos; o
   * cálculo não a altera.
   */
  sessao: Sessao;
  /**
   * Critério sem resposta. Quem monta a tela só oferece a visão para critério
   * que `lacunasDeInformacao` devolveu, o que garante que ele existe, tem valor
   * cadastrado e não tem resposta conhecida — as três recusas de `visaoESe`.
   */
  criterio: Id;
}

export function VisaoESeDoCriterio({ id, sessao, criterio }: VisaoESeDoCriterioProps) {
  const visao = useMemo(() => visaoESe(sessao, criterio), [sessao, criterio]);
  const titulo = useRef<HTMLHeadingElement>(null);
  const conteudo = sessao.conteudo;
  const idTitulo = `${id}-titulo`;

  // A seção aparece no meio da tela de resultado: sem isso, quem navega por
  // teclado ou leitor de tela continuaria no controle e não saberia que ela
  // abriu.
  useEffect(() => {
    titulo.current?.focus();
  }, []);

  return (
    <section id={id} className="resultado-e-se" aria-labelledby={idTitulo}>
      {/* tabIndex −1 torna o título alvo de foco programático sem entrar na
          ordem de tabulação. */}
      <h4 id={idTitulo} tabIndex={-1} ref={titulo}>
        Se «{nomeDoCriterio(conteudo, criterio)}» fosse respondido
      </h4>

      <p>
        Um cenário por valor possível deste critério. Cada cenário recalcula o
        resultado inteiro assumindo aquele valor e mostra o que mudaria. Nada
        aqui é registrado na sessão.
      </p>

      <p className="resultado-e-se-base">
        {textoDasRecomendadas(
          conteudo,
          visao.recomendadasAtuais,
          'Com o que está registrado, as estratégias recomendadas são',
          'Com o que está registrado, nenhuma estratégia está recomendada.',
        )}
      </p>

      {visao.declaracaoSemEfeito === undefined ? null : (
        <p className="resultado-e-se-declaracao">{visao.declaracaoSemEfeito}</p>
      )}

      <ul className="resultado-e-se-cenarios">
        {visao.cenarios.map((cenario) => (
          <li key={cenario.valor.id}>
            <Cenario cenario={cenario} conteudo={conteudo} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Um valor assumido e a sua diferença.
 *
 * O efeito está no título junto com o rótulo do valor: quem chega ao cenário por
 * navegação de títulos precisa ouvir se aquele valor muda algo antes de decidir
 * se lê o resto.
 */
function Cenario({
  cenario,
  conteudo,
}: {
  cenario: CenarioHipotetico;
  conteudo: Conteudo;
}) {
  return (
    <article className="resultado-e-se-cenario">
      <h5>
        {cenario.valor.rotulo} — {resumoDoCenario(cenario)}
      </h5>

      {cenario.mudancasDeFaixa.length === 0 ? null : (
        <ul className="resultado-e-se-mudancas">
          {cenario.mudancasDeFaixa.map((mudanca) => (
            <li key={mudanca.estrategia}>
              {nomeDaEstrategia(conteudo, mudanca.estrategia)}: de «
              {ROTULO_DA_FAIXA[mudanca.de]}» para «{ROTULO_DA_FAIXA[mudanca.para]}
              ».
            </li>
          ))}
        </ul>
      )}

      <p className="resultado-e-se-recomendadas">
        {textoDasRecomendadas(
          conteudo,
          cenario.recomendadas,
          'Recomendadas neste cenário',
          'Nenhuma estratégia ficaria recomendada neste cenário.',
        )}
      </p>

      {cenario.respostasInvalidadas.length === 0 ? null : (
        <p className="resultado-e-se-invalidadas">
          {textoDasRespostasPerdidas(conteudo, cenario.respostasInvalidadas)}
        </p>
      )}
    </article>
  );
}

/**
 * O efeito do cenário em uma expressão.
 *
 * A ordem segue a força do sinal: mudança de faixa é o que o Requisito 3.5 pede
 * apresentar; mudança apenas na ordem das recomendadas é sinal mais fraco, e
 * aparece como tal porque o saldo não é exibido como número (Seção 5.2 do
 * design), mas a ordem é.
 */
function resumoDoCenario(cenario: CenarioHipotetico): string {
  if (cenario.alteraAsFaixas) return 'as faixas mudariam';
  if (cenario.alteraAOrdemDasRecomendadas) {
    return 'as mesmas estratégias seguiriam recomendadas, em outra ordem de prioridade';
  }
  return 'nada mudaria';
}

/** As recomendadas de um lado da comparação, com o texto da lista vazia. */
function textoDasRecomendadas(
  conteudo: Conteudo,
  recomendadas: readonly Id[],
  prefixo: string,
  textoVazio: string,
): string {
  if (recomendadas.length === 0) return textoVazio;
  const nomes = recomendadas
    .map((estrategia) => nomeDaEstrategia(conteudo, estrategia))
    .join(', ');
  return `${prefixo}: ${nomes}.`;
}

/**
 * O que a sessão perderia no cenário.
 *
 * Mesma prestação de contas do aviso de revisão: a resposta que só existia por
 * causa do que estava registrado é descartada, e omitir isso faria o cenário
 * parecer mais barato do que é.
 */
function textoDasRespostasPerdidas(
  conteudo: Conteudo,
  respostas: readonly Resposta[],
): string {
  const descricoes = respostas
    .map((resposta) => descricaoDaResposta(conteudo, resposta))
    .join('; ');
  const quantas =
    respostas.length === 1
      ? 'uma resposta que só existia'
      : `${respostas.length} respostas que só existiam`;
  return `Com este valor a sessão perderia ${quantas} por causa do que está registrado, porque a pergunta que a colheu não seria apresentada: ${descricoes}.`;
}
