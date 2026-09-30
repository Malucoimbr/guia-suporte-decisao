/**
 * Avisos de encerramento (tarefa 7.4; Requisitos 4.2, 4.3 e 4.4; Seção 5.6 do
 * design).
 *
 * O usuário acaba de ler quais estratégias o Guia recomenda. Esta seção é o que
 * impede que ele leia aquilo como decisão tomada, como plano de execução ou como
 * orçamento. São três declarações, na ordem dos critérios de aceitação:
 *
 * 1. a saída é apoio à decisão e não substitui avaliação especializada (4.2);
 * 2. a saída não constitui plano de execução, e vêm com ela os fatores de
 *    sucesso e de fracasso do processo que o Guia não avalia (4.3);
 * 3. a saída não contém estimativa de custo monetário, e vêm com ela os
 *    condutores de custo e os custos ocultos das estratégias recomendadas (4.4).
 *
 * **O que é fixo e o que é conteúdo.** As três declarações são fixas neste
 * módulo, pelo mesmo motivo que `DECLARACAO_SEM_DISTINCAO` é fixa no mecanismo e
 * que os textos da abertura são fixos na sua tela: não vêm da literatura, são o
 * que o Guia diz sobre si mesmo, e não mudam de sessão para sessão. Já as
 * **listas** que acompanham as declarações 2 e 3 vêm dos artigos — fatores de
 * [Kirkila2025], condutores de custo de [Dalakas2025], custos ocultos de
 * [Ramchand2021] —, cada item com o seu estudo de origem, e por isso são
 * conteúdo editável em `src/conteudo/avisos.json` (Requisito 5.1). Acrescentar
 * um fator quando a síntese da Rapid Review avançar é acrescentar uma linha de
 * JSON.
 *
 * **Por que filtrar.** Exibir os treze fatores de fracasso e os onze custos
 * ocultos por inteiro empurraria para o usuário uma lista que em boa parte não
 * diz respeito ao caminho que ele tem à frente: incompatibilidade de plataforma
 * não é risco de quem vai manter a aplicação onde está, e conectividade a rede
 * privada não é custo de quem vai desativá-la. Por isso a decisão de projeto da
 * Seção 5.6 — as listas são filtradas pelas estratégias efetivamente
 * recomendadas na sessão. O item que não depende da estratégia escolhida é
 * cadastrado sem estratégia alguma e aparece sempre.
 *
 * O filtro é apresentação, não inferência: nenhuma estratégia muda de faixa por
 * causa dele, e o critério está escrito na tela para o usuário saber que a lista
 * foi recortada e por qual régua. A associação entre item e estratégia é leitura
 * da pesquisadora — os estudos tratam fatores e custos como propriedades do
 * processo de migração, sem atribuí-los ao vocabulário dos 7Rs —, e o texto
 * cadastrado de cada lista declara isso.
 *
 * Acessibilidade: a seção é uma região rotulada pelo próprio título, os níveis
 * seguem os da tela de resultado — `h3` da seção, `h4` de cada aviso, `h5` de
 * cada lista —, e as listas são listas semânticas. Nada aqui depende de cor.
 */
import type { AvisoDeEncerramento, Conteudo, Id, ItemDeAviso, ListaDeAviso } from '../dominio/tipos';
import { nomeDaEstrategia, referenciaDoEstudo } from './TelaDeResultado';

/** Identificador do título da seção, usado para rotular a região. */
const ID_TITULO = 'resultado-avisos-titulo';

/** Uma das três declarações fixas, com o texto exibido. */
interface Declaracao {
  aviso: AvisoDeEncerramento;
  titulo: string;
  texto: string;
}

/**
 * As três declarações, na ordem dos Requisitos 4.2 a 4.4.
 *
 * O texto de cada uma diz também **por que** o limite existe, e não apenas que
 * ele existe: a razão da terceira, por exemplo, é que estimar custo exigiria
 * inventário automatizado, catálogo de preços e validação por arquitetos —
 * processo que em [Dalakas2025] e [Ramchand2021] passa de dois meses para um
 * único cenário. Sem a razão, o aviso soa como ressalva jurídica; com ela, o
 * usuário sabe o que precisaria fazer para ter aquilo que o Guia não dá.
 */
const DECLARACOES: readonly Declaracao[] = [
  {
    aviso: 'apoioADecisao',
    titulo: 'Este resultado é apoio à decisão, não a decisão',
    texto:
      'As estratégias acima apoiam a sua decisão e não substituem avaliação especializada. O Guia aplica regras derivadas de 17 estudos a respostas dadas por quem conhece o cenário, sem inspecionar a aplicação, o ambiente, os contratos ou os dados da empresa. A orientação que a literatura do corpus admite é dessa natureza: mais de uma conclusão pode valer ao mesmo tempo, e a escolha final é de quem responde.',
  },
  {
    aviso: 'semPlanoDeExecucao',
    titulo: 'Este resultado não é plano de execução',
    texto:
      'Escolher a estratégia não é planejar a migração. O Guia não avalia nada do que determina o resultado da execução — prazo, sequência de fases, validação de dados, treinamento, contingência —, e é por aí que migrações fracassam mesmo quando a estratégia escolhida era a adequada. Os fatores abaixo estão registrados para que você saiba o que ainda falta decidir.',
  },
  {
    aviso: 'semEstimativaDeCusto',
    titulo: 'Este resultado não contém estimativa de custo monetário',
    texto:
      'Nenhum valor apresentado aqui é financeiro, e as posições das estratégias não representam quanto cada caminho custa. Estimar custo exigiria inventário automatizado do ambiente, catálogos de preço do provedor e validação por arquitetos: nos estudos que fizeram esse trabalho, o processo passou de dois meses para um único cenário. O que o Guia pode fazer é apontar o que entra nessa conta e o que costuma ficar fora dela.',
  },
];

export interface AvisosDeEncerramentoProps {
  /** Conteúdo da sessão, fonte das listas, dos nomes e das referências. */
  conteudo: Conteudo;
  /**
   * Estratégias recomendadas nesta sessão. É a régua do filtro das listas
   * (Seção 5.6 do design).
   */
  recomendadas: readonly Id[];
}

export function AvisosDeEncerramento({ conteudo, recomendadas }: AvisosDeEncerramentoProps) {
  const listas = conteudo.listasDeAviso ?? [];

  return (
    <section className="resultado-avisos" aria-labelledby={ID_TITULO}>
      <h3 id={ID_TITULO}>Limites deste resultado</h3>
      <p>
        Três limites do que você acabou de ler. Eles valem para toda sessão do
        Guia, independentemente das respostas registradas.
      </p>

      {DECLARACOES.map((declaracao) => (
        <Aviso
          key={declaracao.aviso}
          declaracao={declaracao}
          listas={listas.filter((lista) => lista.aviso === declaracao.aviso)}
          conteudo={conteudo}
          recomendadas={recomendadas}
        />
      ))}
    </section>
  );
}

/** Uma declaração com as listas cadastradas para ela, já filtradas. */
function Aviso({
  declaracao,
  listas,
  conteudo,
  recomendadas,
}: {
  declaracao: Declaracao;
  listas: readonly ListaDeAviso[];
  conteudo: Conteudo;
  recomendadas: readonly Id[];
}) {
  return (
    <article className="resultado-aviso">
      <h4>{declaracao.titulo}</h4>
      <p>{declaracao.texto}</p>

      {listas.length === 0 ? null : (
        <p className="resultado-aviso-recorte">{textoDoRecorte(conteudo, recomendadas)}</p>
      )}

      {listas.map((lista) => (
        <ListaDoAviso
          key={lista.id}
          lista={lista}
          conteudo={conteudo}
          recomendadas={recomendadas}
        />
      ))}
    </article>
  );
}

/** Uma lista cadastrada, com os itens que se aplicam à sessão. */
function ListaDoAviso({
  lista,
  conteudo,
  recomendadas,
}: {
  lista: ListaDeAviso;
  conteudo: Conteudo;
  recomendadas: readonly Id[];
}) {
  const itens = filtrarItensPorEstrategias(lista.itens, recomendadas);

  return (
    <>
      <h5>{lista.titulo}</h5>
      <p className="resultado-aviso-descricao">{lista.descricao}</p>
      {itens.length === 0 ? (
        <p className="resultado-aviso-vazio">
          Nenhum item desta lista se aplica às estratégias recomendadas nesta
          sessão.
        </p>
      ) : (
        <ul className="resultado-aviso-itens">
          {itens.map((item) => (
            <li key={item.id}>
              {item.texto}{' '}
              <span className="item-fonte">
                Fonte:{' '}
                {item.estudosDeOrigem
                  .map((estudo) => referenciaDoEstudo(conteudo, estudo))
                  .join(' | ')}
              </span>
              {item.estrategias.length === 0 ? null : (
                <span className="item-estrategias">
                  {' '}
                  Aplica-se a:{' '}
                  {item.estrategias
                    .map((estrategia) => nomeDaEstrategia(conteudo, estrategia))
                    .join(', ')}
                  .
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Os itens que se aplicam às estratégias recomendadas na sessão (Seção 5.6 do
 * design).
 *
 * Item sem estratégia associada se aplica sempre: é fator ou custo do processo,
 * não do caminho escolhido. Item com estratégias entra quando ao menos uma delas
 * foi recomendada — basta uma, porque o usuário que recebeu duas recomendações
 * precisa saber o que pesa em cada uma.
 */
export function filtrarItensPorEstrategias(
  itens: readonly ItemDeAviso[],
  recomendadas: readonly Id[],
): ItemDeAviso[] {
  return itens.filter(
    (item) =>
      item.estrategias.length === 0 ||
      item.estrategias.some((estrategia) => recomendadas.includes(estrategia)),
  );
}

/**
 * O texto que declara a régua do recorte. Dizer que a lista foi filtrada é parte
 * do aviso: uma lista curta sem explicação passaria por lista completa.
 */
function textoDoRecorte(conteudo: Conteudo, recomendadas: readonly Id[]): string {
  if (recomendadas.length === 0) {
    return 'Nenhuma estratégia foi recomendada nesta sessão, então as listas abaixo trazem apenas os itens que não dependem da estratégia escolhida.';
  }
  const nomes = recomendadas
    .map((estrategia) => nomeDaEstrategia(conteudo, estrategia))
    .join(', ');
  return `As listas abaixo trazem os itens que não dependem da estratégia escolhida e os que se aplicam ao que foi recomendado nesta sessão: ${nomes}.`;
}
