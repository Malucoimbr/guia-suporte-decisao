/**
 * Tela de resultado (tarefa 7.3; Requisitos 2.1 a 2.6, 3.4 e 4.5; Seções 5.2 a
 * 5.6 do design).
 *
 * É o que a sessão existe para produzir. A tela não decide nada: `encerrarColeta`
 * devolve o quadro final e esta tela o apresenta na ordem da Seção 5.5 do
 * design. Nenhum cálculo de faixa, de saldo ou de marcação acontece aqui — se
 * alguma decisão parecer estar nesta tela, ela está no lugar errado.
 *
 * O que a apresentação acrescenta ao quadro é a tradução de identificador para
 * texto: o resultado fala em `refactor`, `carga` e `[Fonseca2024]`, e o usuário
 * lê o nome da estratégia, o nome do critério e a referência do estudo. Essa
 * tradução sai do conteúdo carregado pela sessão, não de tabela no código: nomes
 * de estratégia, rótulos de valor e referências são conteúdo editável
 * (Requisito 5.1).
 *
 * Quatro decisões de apresentação merecem estar explícitas:
 *
 * - **O saldo não aparece.** A justificativa de uma posição é a lista de regras
 *   acionadas, cada uma com a condição satisfeita, as respostas que a
 *   satisfizeram, o motivo e a referência (Requisitos 2.2 e 2.3, Seção 5.2 do
 *   design). Número de pontos não explica nada a quem precisa defender a decisão
 *   internamente.
 * - **"Possível" vem com o motivo de ser possível.** "Evidência dividida" — a
 *   literatura falou e discordou — e "nenhuma regra se aplicou" — a literatura
 *   não falou — são situações diferentes e aparecem escritas, não implícitas
 *   (Seção 5.3).
 * - **"Não avaliada" fica separada das três faixas.** A estratégia sem regra
 *   cadastrada não foi descartada nem aprovada: ficou fora da avaliação, e a
 *   razão é exibida junto (Seção 5.4).
 * - **O que falta é dito, não escondido.** Resultado parcial declara por que é
 *   parcial e quais critérios ficaram sem resposta, distinguindo os respondidos
 *   como "não sei" das perguntas que não foram apresentadas (Requisito 3.4).
 *
 * Acessibilidade: os títulos descem um nível por vez a partir do `h1` da
 * aplicação — `h2` da tela, `h3` de cada grupo, `h4` de cada estratégia, `h5` de
 * cada lista de regras —, as faixas e as regras são listas semânticas, e a faixa
 * de cada estratégia está no texto do seu próprio título: nada aqui depende de
 * cor nem de posição na página. O título recebe foco na montagem, porque a tela
 * substitui a pergunta sem que a página mude.
 *
 * Os três avisos de encerramento do Requisito 4 — apoio à decisão, ausência de
 * plano de execução e ausência de estimativa de custo — fecham a tela e vivem em
 * `AvisosDeEncerramento`, com as listas que os acompanham cadastradas como
 * conteúdo.
 *
 * A lista de critérios sem resposta é também de onde se pede a visão «e se»: cada
 * critério que admite a visão ganha um controle que a abre sob demanda, e o
 * recálculo por valor possível fica em `VisaoESeDoCriterio` (Requisito 3.5,
 * tarefa 8.1). Sob demanda, e não sempre visível, porque a visão de todos os
 * critérios sem resposta de uma vez enterraria o resultado que o usuário veio
 * ler; um por vez, porque comparar cenário de dois critérios diferentes não é o
 * que o Requisito 3.5 propõe.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { encerrarColeta, type RazaoDeResultadoParcial } from '../sessao/encerramento';
import { lacunasDeInformacao } from '../sessao/eSe';
import { AvisosDeEncerramento } from './AvisosDeEncerramento';
import { VisaoESeDoCriterio } from './VisaoESeDoCriterio';
import type {
  Conteudo,
  Faixa,
  Id,
  PosicaoDeEstrategia,
  RegraAcionada,
  Resposta,
  Sessao,
} from '../dominio/tipos';

/** Identificador do título da tela, usado para rotular a região. */
const ID_TITULO = 'resultado-titulo';

/**
 * Rótulo de cada faixa. Aparece no título da estratégia, e não apenas como
 * agrupamento visual: quem chega ao título por navegação de leitor de tela
 * precisa ouvir a faixa junto com o nome.
 *
 * Exportado porque a visão «e se» descreve mudança de faixa — "de possível para
 * recomendada" — e as duas telas precisam chamar a mesma faixa pelo mesmo nome.
 */
export const ROTULO_DA_FAIXA: Readonly<Record<Faixa, string>> = {
  recomendada: 'recomendada',
  possivel: 'possível',
  naoRecomendada: 'não recomendada',
};

/** Por que o resultado é parcial, em texto (Requisito 3.4). */
const TEXTO_DA_RAZAO_PARCIAL: Readonly<Record<RazaoDeResultadoParcial, string>> = {
  respostaDesconhecida:
    'Ao menos um critério foi respondido como «não sei». As regras que dependiam desse critério não foram aplicadas, e nenhuma estratégia foi descartada por causa disso.',
  coletaEncerradaAntesDoFim:
    'A coleta foi encerrada antes de esgotar as perguntas capazes de alterar o resultado.',
};

export interface TelaDeResultadoProps {
  /**
   * Sessão a apresentar. O quadro final é derivado dela; o conteúdo que ela
   * carregou é a fonte dos nomes, rótulos e referências exibidos.
   */
  sessao: Sessao;
  /**
   * Aciona a alteração da resposta de um critério já respondido
   * (Requisito 1.5). Ausente, a tela apenas lista as respostas registradas —
   * quem recalcula perguntas e posições é o mecanismo, não esta tela.
   */
  onRevisar?: (criterio: Id) => void;
  /**
   * Volta às perguntas que continuavam na fila. Oferecido apenas quando há
   * pergunta pendente, isto é, quando o usuário pediu o resultado antes do fim.
   */
  onVoltarAsPerguntas?: () => void;
}

export function TelaDeResultado({
  sessao,
  onRevisar,
  onVoltarAsPerguntas,
}: TelaDeResultadoProps) {
  const resultado = useMemo(() => encerrarColeta(sessao), [sessao]);
  const titulo = useRef<HTMLHeadingElement>(null);
  const conteudo = sessao.conteudo;
  /** Critério cuja visão «e se» está aberta. Uma por vez (Requisito 3.5). */
  const [criterioEmVisao, setCriterioEmVisao] = useState<Id>();

  /**
   * Critérios sem resposta que admitem a visão. Quem responde é o mecanismo:
   * critério sem valor cadastrado não tem cenário a montar, e oferecer o
   * controle nesse caso levaria a uma visão que não existe.
   */
  const criteriosComVisao = useMemo(
    () => new Set(lacunasDeInformacao(sessao).map((lacuna) => lacuna.criterio.id)),
    [sessao],
  );

  // A tela substitui a pergunta sem que a página mude: sem isso o foco ficaria
  // no botão que desapareceu.
  useEffect(() => {
    titulo.current?.focus();
  }, []);

  const podeVoltar =
    onVoltarAsPerguntas !== undefined && resultado.perguntasNaoApresentadas.length > 0;

  /**
   * Abre a visão «e se» do critério, ou fecha a que está aberta.
   *
   * Ao abrir, quem chama o foco é a própria visão, no seu título. Ao fechar, o
   * foco volta ao controle: a região que o continha deixou de existir, e sem
   * isso quem navega por teclado seria devolvido ao início da página.
   */
  function alternarVisao(criterio: Id, controle: HTMLButtonElement) {
    const fechando = criterioEmVisao === criterio;
    setCriterioEmVisao(fechando ? undefined : criterio);
    if (fechando) controle.focus();
  }

  return (
    <section className="resultado" aria-labelledby={ID_TITULO}>
      {/* tabIndex −1 torna o título alvo de foco programático sem entrar na
          ordem de tabulação. */}
      <h2 id={ID_TITULO} tabIndex={-1} ref={titulo}>
        Resultado da avaliação
      </h2>

      <p>
        As estratégias aparecem em três faixas — recomendada, possível e não
        recomendada —, cada uma com o motivo e o estudo que sustenta aquele
        motivo.
      </p>

      {resultado.naoDistinguiuAlternativas ? (
        <p className="resultado-declaracao">{resultado.declaracaoSemDistincao}</p>
      ) : null}

      {resultado.ehParcial ? (
        <section className="resultado-parcial" aria-labelledby="resultado-parcial-titulo">
          <h3 id="resultado-parcial-titulo">Este resultado é parcial</h3>
          <ul>
            {resultado.razoesDeResultadoParcial.map((razao) => (
              <li key={razao}>{TEXTO_DA_RAZAO_PARCIAL[razao]}</li>
            ))}
          </ul>

          <p>
            Critérios sem resposta. Para cada um, o Guia recalcula o resultado
            assumindo cada valor possível, um por vez, e mostra o que mudaria: é
            o que permite decidir se vale a pena ir buscar a informação.
          </p>
          <ul className="resultado-criterios-sem-resposta">
            {resultado.criteriosDeclaradosDesconhecidos.map((criterio) => (
              <CriterioSemResposta
                key={criterio}
                sessao={sessao}
                criterio={criterio}
                origem="respondido como «não sei»"
                temVisao={criteriosComVisao.has(criterio)}
                aberto={criterioEmVisao === criterio}
                onAlternar={alternarVisao}
              />
            ))}
            {resultado.criteriosNaoPerguntados.map((criterio) => (
              <CriterioSemResposta
                key={criterio}
                sessao={sessao}
                criterio={criterio}
                origem="a pergunta não foi apresentada"
                temVisao={criteriosComVisao.has(criterio)}
                aberto={criterioEmVisao === criterio}
                onAlternar={alternarVisao}
              />
            ))}
          </ul>

          {podeVoltar ? (
            <p>
              <button type="button" onClick={onVoltarAsPerguntas}>
                Voltar às perguntas pendentes
              </button>
            </p>
          ) : null}
        </section>
      ) : null}

      <GrupoDeFaixa
        id="resultado-recomendadas"
        titulo="Estratégias recomendadas"
        descricao="A evidência registrada nesta sessão aponta a favor destas estratégias."
        vazio="Nenhuma estratégia foi recomendada com as respostas registradas."
        posicoes={resultado.recomendadas}
        conteudo={conteudo}
      />

      <GrupoDeFaixa
        id="resultado-possiveis"
        titulo="Estratégias possíveis"
        descricao="Não foram descartadas, e a evidência registrada não as favorece nem as desfavorece no saldo."
        vazio="Nenhuma estratégia ficou nesta faixa."
        posicoes={resultado.possiveis}
        conteudo={conteudo}
      />

      <GrupoDeFaixa
        id="resultado-nao-recomendadas"
        titulo="Estratégias não recomendadas"
        descricao="Descartadas por verificação obrigatória que falhou ou por evidência contrária."
        vazio="Nenhuma estratégia foi descartada."
        posicoes={resultado.naoRecomendadas}
        conteudo={conteudo}
      />

      {resultado.naoAvaliadas.length > 0 ? (
        <section aria-labelledby="resultado-nao-avaliadas">
          <h3 id="resultado-nao-avaliadas">Estratégias não avaliadas pelo Guia</h3>
          <p>
            Não foram descartadas nem aprovadas: ficaram fora da avaliação. O
            grupo desaparece quando o conteúdo passar a ter regra para elas.
          </p>
          <ul className="resultado-nao-avaliadas">
            {resultado.naoAvaliadas.map((naoAvaliada) => (
              <li key={naoAvaliada.estrategia}>
                <h4>{nomeDaEstrategia(conteudo, naoAvaliada.estrategia)} — não avaliada</h4>
                <p>{naoAvaliada.razao}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RespostasRegistradas sessao={sessao} onRevisar={onRevisar} />

      {/* Os três limites do Requisito 4 fecham a tela, depois de o usuário ter
          lido o que o Guia recomenda: é ali que ele precisa saber que aquilo não
          é decisão tomada, plano de execução nem orçamento. As listas que
          acompanham dois dos avisos são filtradas pelas estratégias recomendadas
          nesta sessão (Seção 5.6 do design). */}
      <AvisosDeEncerramento
        conteudo={conteudo}
        recomendadas={resultado.recomendadas.map((posicao) => posicao.estrategia)}
      />
    </section>
  );
}

/**
 * Um critério sem resposta, com o controle que pede a visão «e se»
 * (Requisito 3.5).
 *
 * A origem da lacuna vem escrita ao lado do nome, porque «não sei» e «a pergunta
 * não foi apresentada» são situações diferentes para quem lê (Requisito 3.4). O
 * controle só aparece quando o critério admite a visão, e o rótulo traz o nome do
 * critério: numa lista de vários controles iguais, "Ver o que mudaria" sozinho
 * não distingue nada para quem navega por lista de controles.
 */
function CriterioSemResposta({
  sessao,
  criterio,
  origem,
  temVisao,
  aberto,
  onAlternar,
}: {
  sessao: Sessao;
  criterio: Id;
  origem: string;
  temVisao: boolean;
  aberto: boolean;
  onAlternar: (criterio: Id, controle: HTMLButtonElement) => void;
}) {
  const nome = nomeDoCriterio(sessao.conteudo, criterio);
  const idDaVisao = `resultado-e-se-${criterio}`;

  return (
    <li>
      {nome} — {origem}
      {temVisao ? (
        <>
          {' '}
          <button
            type="button"
            aria-expanded={aberto}
            // Apontar para a região só enquanto ela existe: fechada, a
            // referência ficaria pendurada em identificador ausente.
            {...(aberto ? { 'aria-controls': idDaVisao } : {})}
            onClick={(evento) => onAlternar(criterio, evento.currentTarget)}
          >
            {aberto ? 'Ocultar' : 'Ver'} o que mudaria sabendo «{nome}»
          </button>
        </>
      ) : null}
      {aberto ? (
        <VisaoESeDoCriterio id={idDaVisao} sessao={sessao} criterio={criterio} />
      ) : null}
    </li>
  );
}

/**
 * Uma das três faixas, com as estratégias que caíram nela.
 *
 * A faixa vazia continua aparecendo, com o texto do que a ausência significa:
 * omitir a seção deixaria o usuário sem saber se nada caiu ali ou se o Guia
 * deixou de avaliar.
 */
function GrupoDeFaixa({
  id,
  titulo,
  descricao,
  vazio,
  posicoes,
  conteudo,
}: {
  id: string;
  titulo: string;
  descricao: string;
  vazio: string;
  posicoes: readonly PosicaoDeEstrategia[];
  conteudo: Conteudo;
}) {
  return (
    <section className="resultado-faixa" aria-labelledby={id}>
      <h3 id={id}>{titulo}</h3>
      <p>{descricao}</p>
      {posicoes.length === 0 ? (
        <p className="resultado-faixa-vazia">{vazio}</p>
      ) : (
        <ul className="resultado-estrategias">
          {posicoes.map((posicao) => (
            <li key={posicao.estrategia}>
              <PosicaoDaEstrategia posicao={posicao} conteudo={conteudo} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Uma estratégia com a justificativa da sua posição.
 *
 * A ordem das listas segue o que o usuário precisa saber primeiro: a verificação
 * obrigatória que falhou é o motivo do descarte e não é compensável por
 * pontuação (Requisito 2.4, Seção 5.1 do design), então vem antes das
 * contribuições.
 */
function PosicaoDaEstrategia({
  posicao,
  conteudo,
}: {
  posicao: PosicaoDeEstrategia;
  conteudo: Conteudo;
}) {
  const estrategia = conteudo.estrategias.find((item) => item.id === posicao.estrategia);

  return (
    <article className="resultado-estrategia">
      <h4>
        {nomeDaEstrategia(conteudo, posicao.estrategia)} —{' '}
        {ROTULO_DA_FAIXA[posicao.faixa]}
      </h4>

      {estrategia === undefined ? null : <p>{estrategia.descricao}</p>}

      {posicao.nenhumaRegraAplicada ? (
        <p className="resultado-observacao">
          Nenhuma regra se aplicou: o conteúdo tem regras para esta estratégia,
          mas nenhuma delas alcança as respostas desta sessão.
        </p>
      ) : null}

      {posicao.evidenciaDividida ? (
        <p className="resultado-observacao">
          Evidência dividida: há regras nas duas direções. O Guia não resolve o
          conflito — as duas listas ficam visíveis.
        </p>
      ) : null}

      <ListaDeRegras
        titulo="Verificação obrigatória que falhou"
        regras={posicao.precondicoesFalhadas}
        conteudo={conteudo}
      />
      <ListaDeRegras titulo="A favor" regras={posicao.regrasAFavor} conteudo={conteudo} />
      <ListaDeRegras titulo="Contra" regras={posicao.regrasContra} conteudo={conteudo} />

      {posicao.temMarcacaoDeInterpretacao ? (
        <p className="resultado-marcacao">
          Marcação de interpretação: a correspondência entre o texto do estudo e
          o vocabulário dos 7Rs é interpretação da pesquisadora, não afirmação do
          estudo.
        </p>
      ) : null}

      {posicao.temMarcacaoDePorte ? (
        <p className="resultado-marcacao">
          Marcação de porte: a evidência que sustenta esta posição vem apenas de
          estudos que não analisaram organizações com menos de 250 funcionários.
        </p>
      ) : null}
    </article>
  );
}

/**
 * As regras acionadas de um lado, cada uma com o rastro exigido pelos
 * Requisitos 2.2 e 2.3: a condição satisfeita, as respostas que a satisfizeram,
 * o motivo e a referência do estudo.
 */
function ListaDeRegras({
  titulo,
  regras,
  conteudo,
}: {
  titulo: string;
  regras: readonly RegraAcionada[];
  conteudo: Conteudo;
}) {
  if (regras.length === 0) return null;

  return (
    <>
      <h5>{titulo}</h5>
      <ul className="resultado-regras">
        {regras.map((regra) => (
          <li key={regra.regra}>
            <p className="regra-motivo">{regra.textoMotivo}</p>
            <p className="regra-condicao">
              Condição satisfeita: {regra.condicaoSatisfeita.descricao}
            </p>
            <p className="regra-respostas">
              Suas respostas: {descricaoDasRespostas(conteudo, regra.respostasQueSatisfizeram)}
            </p>
            <p className="regra-fonte">
              Fonte: {regra.estudosDeOrigem.map((estudo) => referenciaDoEstudo(conteudo, estudo)).join(' | ')}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * As respostas registradas, com o controle para alterar cada uma
 * (Requisito 1.5).
 *
 * A lista existe por dois motivos: o usuário precisa poder conferir sobre o que
 * respondeu antes de aceitar o resultado, e precisa poder voltar e alterar uma
 * resposta. O controle só aparece para critério investigado por alguma pergunta
 * do catálogo — é a pergunta que a alteração reapresenta.
 */
function RespostasRegistradas({
  sessao,
  onRevisar,
}: {
  sessao: Sessao;
  onRevisar?: (criterio: Id) => void;
}) {
  if (sessao.respostas.length === 0) return null;
  const conteudo = sessao.conteudo;

  return (
    <section aria-labelledby="resultado-respostas">
      <h3 id="resultado-respostas">Respostas registradas</h3>
      <p>
        Alterar uma resposta reavalia as perguntas seguintes e recalcula a
        posição de todas as estratégias.
      </p>
      <ul className="resultado-respostas">
        {sessao.respostas.map((resposta) => {
          const temPergunta = conteudo.perguntas.some(
            (pergunta) => pergunta.criterio === resposta.criterio,
          );
          return (
            <li key={resposta.criterio}>
              {descricaoDaResposta(conteudo, resposta)}
              {onRevisar !== undefined && temPergunta ? (
                <>
                  {' '}
                  <button type="button" onClick={() => onRevisar(resposta.criterio)}>
                    Alterar a resposta sobre {nomeDoCriterio(conteudo, resposta.criterio)}
                  </button>
                </>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Nome do critério cadastrado, ou o identificador quando o conteúdo não o traz.
 *
 * O recuo para o identificador é deliberado: a verificação de consistência
 * (tarefa 2.3) acusa essa lacuna antes de a sessão existir, e apresentar o
 * identificador é mais honesto do que omitir o item do resultado.
 */
export function nomeDoCriterio(conteudo: Conteudo, criterio: Id): string {
  return conteudo.criterios.find((item) => item.id === criterio)?.nome ?? criterio;
}

/** Nome da estratégia cadastrada, ou o identificador na ausência dele. */
export function nomeDaEstrategia(conteudo: Conteudo, estrategia: Id): string {
  return conteudo.estrategias.find((item) => item.id === estrategia)?.nome ?? estrategia;
}

/**
 * Referência do estudo precedida do identificador (Requisito 2.3). O
 * identificador sozinho não é referência; a referência sozinha não liga o
 * motivo ao que está escrito no resto do Guia.
 */
export function referenciaDoEstudo(conteudo: Conteudo, estudo: Id): string {
  const cadastrado = conteudo.estudos.find((item) => item.id === estudo);
  return cadastrado === undefined ? estudo : `${estudo} — ${cadastrado.referencia}`;
}

/** Uma resposta em texto: o nome do critério e os rótulos escolhidos. */
export function descricaoDaResposta(conteudo: Conteudo, resposta: Resposta): string {
  const nome = nomeDoCriterio(conteudo, resposta.criterio);
  if (resposta.valor.tipo === 'desconhecida') return `${nome}: não sei`;

  const criterio = conteudo.criterios.find((item) => item.id === resposta.criterio);
  const rotulos = resposta.valor.valores.map(
    (valor) => criterio?.valores.find((item) => item.id === valor)?.rotulo ?? valor,
  );
  return `${nome}: ${rotulos.join(', ')}`;
}

/** As respostas que satisfizeram uma condição, em texto corrido. */
function descricaoDasRespostas(conteudo: Conteudo, respostas: readonly Resposta[]): string {
  return respostas.map((resposta) => descricaoDaResposta(conteudo, resposta)).join('; ');
}
