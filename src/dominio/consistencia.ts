/**
 * Verificação de consistência do conteúdo editável (Seção 8.3 do design;
 * Requisitos 5.3 e 5.4, com 2.5 e 4.5 nas marcações).
 *
 * A carga (`carga.ts`) verifica a **forma** de cada item, um arquivo por vez.
 * Esta é a camada seguinte: a coerência **entre** os arquivos — regra que
 * aponta para estudo e estratégia cadastrados, condição que usa critério e
 * valor cadastrados, pergunta que investiga critério usado por alguma regra,
 * item de aviso de encerramento que aponta para estudo e estratégia
 * cadastrados, e as marcações obrigatórias de interpretação e de porte. É o que
 * impede que a evolução do conteúdo prevista na Seção 7 do design quebre o Guia
 * em silêncio.
 *
 * A verificação recebe o conteúdo como argumento e não lê arquivo nenhum: serve
 * tanto ao conteúdo do repositório quanto a conteúdo montado em teste. Como na
 * carga, todas as divergências são acumuladas em vez de parar na primeira, para
 * que a pesquisadora corrija o JSON de uma só vez.
 */
import type { Condicao, Conteudo, Id, IdEstudo, Regra } from './tipos';

/**
 * Divergência encontrada no conteúdo, com identificação do item.
 * `item` nomeia o item do conteúdo — `regra R12`, `pergunta P4` — e `problema`
 * descreve o que está incoerente.
 */
export interface Divergencia {
  item: string;
  problema: string;
}

/**
 * Estudos cujo uso em uma regra exige a marcação de interpretação
 * (Requisito 2.5).
 *
 * [Kirkila2025] não usa o vocabulário dos 7Rs: "substituir" admite Retire ou
 * Repurchase e "evoluir" admite Retain ou Replatform (Seção 6.1 dos
 * requisitos), de modo que toda regra derivada dele traduz o texto do estudo
 * para os 7Rs por leitura da pesquisadora.
 */
export const ESTUDOS_QUE_EXIGEM_MARCACAO_DE_INTERPRETACAO: readonly IdEstudo[] = ['[Kirkila2025]'];

/**
 * Estudos cuja evidência vem apenas de organizações com 250 funcionários ou
 * mais (Requisito 4.5). Regra sustentada **exclusivamente** por estudos desta
 * lista exige a marcação de porte.
 */
export const ESTUDOS_QUE_EXIGEM_MARCACAO_DE_PORTE: readonly IdEstudo[] = [
  '[Dalakas2025]',
  '[Jose2021]',
  '[Zibitsker2025]',
  '[Seifert2024]',
];

/**
 * Ajuste das duas listas de estudos que disparam marcação obrigatória.
 *
 * As listas são conteúdo, não mecanismo: se a síntese da Rapid Review
 * reclassificar um estudo, muda a lista e não a verificação. Os padrões são
 * {@link ESTUDOS_QUE_EXIGEM_MARCACAO_DE_INTERPRETACAO} e
 * {@link ESTUDOS_QUE_EXIGEM_MARCACAO_DE_PORTE}.
 */
export interface OpcoesDeVerificacao {
  estudosQueExigemMarcacaoDeInterpretacao?: readonly IdEstudo[];
  estudosQueExigemMarcacaoDePorte?: readonly IdEstudo[];
}

/** Conteúdo inconsistente. Reúne todas as divergências encontradas. */
export class ErroDeConsistenciaDeConteudo extends Error {
  readonly divergencias: readonly Divergencia[];

  constructor(divergencias: readonly Divergencia[]) {
    super(
      `Conteúdo inconsistente (${divergencias.length} ${
        divergencias.length === 1 ? 'divergência' : 'divergências'
      }):\n- ${divergencias.map(descreverDivergencia).join('\n- ')}`,
    );
    this.name = 'ErroDeConsistenciaDeConteudo';
    this.divergencias = divergencias;
  }
}

/** Texto de uma linha de relatório: `regra R12: aponta para estudo ...`. */
export function descreverDivergencia(divergencia: Divergencia): string {
  return `${divergencia.item}: ${divergencia.problema}`;
}

// ---------------------------------------------------------------------------
// Verificação
// ---------------------------------------------------------------------------

/**
 * Confere a coerência entre os arquivos de conteúdo e devolve as divergências
 * encontradas. Lista vazia significa conteúdo consistente.
 */
export function verificarConsistencia(
  conteudo: Conteudo,
  opcoes: OpcoesDeVerificacao = {},
): Divergencia[] {
  const divergencias: Divergencia[] = [];
  const acusar = (item: string, problema: string) => divergencias.push({ item, problema });

  const exigemInterpretacao = new Set(
    opcoes.estudosQueExigemMarcacaoDeInterpretacao ??
      ESTUDOS_QUE_EXIGEM_MARCACAO_DE_INTERPRETACAO,
  );
  const exigemPorte = new Set(
    opcoes.estudosQueExigemMarcacaoDePorte ?? ESTUDOS_QUE_EXIGEM_MARCACAO_DE_PORTE,
  );

  const criteriosPorId = new Map(conteudo.criterios.map((criterio) => [criterio.id, criterio]));
  const estrategiasCadastradas = new Set(conteudo.estrategias.map((estrategia) => estrategia.id));
  const estudosCadastrados = new Set(conteudo.estudos.map((estudo) => estudo.id));
  const criteriosUsadosPorRegra = new Set(
    conteudo.regras.flatMap((regra) => regra.condicao.pares.map((par) => par.criterio)),
  );

  acusarIdsRepetidos(conteudo, acusar);

  // --- Critérios: valor de resposta pertence ao critério que o contém --------
  for (const criterio of conteudo.criterios) {
    const item = `critério ${criterio.id}`;
    if (criterio.valores.length === 0) {
      acusar(item, 'não tem valor de resposta cadastrado, então nenhuma pergunta pode usá-lo');
    }
    for (const valor of criterio.valores) {
      if (valor.criterio !== criterio.id) {
        acusar(
          item,
          `o valor ${valor.id} declara pertencer ao critério ${valor.criterio}, não a este`,
        );
      }
    }
  }

  /** Confere os pares critério–valor de uma condição contra o cadastro. */
  const acusarParesNaoCadastrados = (item: string, contexto: string, condicao: Condicao) => {
    for (const par of condicao.pares) {
      const criterio = criteriosPorId.get(par.criterio);
      if (criterio === undefined) {
        acusar(item, `${contexto} usa o critério ${par.criterio}, que não está cadastrado`);
        continue;
      }
      if (!criterio.valores.some((valor) => valor.id === par.valor)) {
        acusar(
          item,
          `${contexto} usa o valor ${par.valor}, que não está cadastrado no critério ${par.criterio}`,
        );
      }
    }
  };

  // --- Regras ---------------------------------------------------------------
  for (const regra of conteudo.regras) {
    const item = `regra ${regra.id}`;

    if (!estrategiasCadastradas.has(regra.estrategiaAlvo)) {
      acusar(item, `aponta para a estratégia ${regra.estrategiaAlvo}, que não está cadastrada`);
    }

    if (regra.estudosDeOrigem.length === 0) {
      acusar(item, 'não registra o estudo que a sustenta');
    }
    for (const estudo of regra.estudosDeOrigem) {
      if (!estudosCadastrados.has(estudo)) {
        acusar(item, `aponta para o estudo ${estudo}, que não está cadastrado`);
      }
    }

    if (regra.condicao.pares.length === 0) {
      acusar(item, 'tem condição sem par critério–valor, e por isso se aplicaria sempre');
    }
    acusarParesNaoCadastrados(item, 'a condição', regra.condicao);

    if (regra.textoMotivo.trim() === '') {
      acusar(item, 'não tem texto de motivo, exigido para justificar a posição da estratégia');
    }

    acusarMarcacoesAusentes(regra, item, exigemInterpretacao, exigemPorte, acusar);
  }

  // --- Perguntas ------------------------------------------------------------
  for (const pergunta of conteudo.perguntas) {
    const item = `pergunta ${pergunta.id}`;

    if (!criteriosPorId.has(pergunta.criterio)) {
      acusar(item, `investiga o critério ${pergunta.criterio}, que não está cadastrado`);
    } else if (!criteriosUsadosPorRegra.has(pergunta.criterio)) {
      acusar(
        item,
        `investiga o critério ${pergunta.criterio}, que nenhuma regra usa, então a resposta não move estratégia`,
      );
    }

    for (const estrategia of pergunta.estrategiasAfetadas) {
      if (!estrategiasCadastradas.has(estrategia)) {
        acusar(item, `afeta a estratégia ${estrategia}, que não está cadastrada`);
      }
    }

    for (const fonte of pergunta.fontes) {
      if (!estudosCadastrados.has(fonte)) {
        acusar(item, `cita o estudo ${fonte}, que não está cadastrado`);
      }
    }

    const exibicao = pergunta.condicaoDeExibicao;
    if (exibicao?.respostas !== undefined) {
      acusarParesNaoCadastrados(item, 'a condição de exibição', exibicao.respostas);
    }
    for (const estrategia of exibicao?.estrategiasEmJogo ?? []) {
      if (!estrategiasCadastradas.has(estrategia)) {
        acusar(
          item,
          `só aparece com a estratégia ${estrategia} em jogo, e ela não está cadastrada`,
        );
      }
    }
  }

  // --- Listas dos avisos de encerramento (Requisitos 4.3 e 4.4) -------------
  // Ausentes é situação legítima: as três declarações do encerramento são fixas
  // e não dependem do conteúdo. O que se confere é o que está cadastrado.
  for (const lista of conteudo.listasDeAviso ?? []) {
    const item = `lista de aviso ${lista.id}`;

    if (lista.itens.length === 0) {
      acusar(item, 'não tem item cadastrado, então apareceria como seção vazia no encerramento');
    }

    for (const itemDaLista of lista.itens) {
      const onde = `${item}, item ${itemDaLista.id}`;

      if (itemDaLista.estudosDeOrigem.length === 0) {
        acusar(onde, 'não registra o estudo que o sustenta');
      }
      for (const estudo of itemDaLista.estudosDeOrigem) {
        if (!estudosCadastrados.has(estudo)) {
          acusar(onde, `aponta para o estudo ${estudo}, que não está cadastrado`);
        }
      }

      // Lista de estratégias vazia é valor legítimo: item que não depende da
      // estratégia escolhida aparece em toda sessão (Seção 5.6 do design).
      for (const estrategia of itemDaLista.estrategias) {
        if (!estrategiasCadastradas.has(estrategia)) {
          acusar(onde, `associa-se à estratégia ${estrategia}, que não está cadastrada`);
        }
      }
    }
  }

  return divergencias;
}

/**
 * As duas marcações que o resultado precisa propagar (Requisitos 2.5 e 4.5).
 * A de interpretação é exigida quando **algum** estudo de origem a exige; a de
 * porte, quando **todos** os estudos de origem a exigem — regra sustentada
 * também por estudo de PMEs não é evidência apenas de porte grande.
 */
function acusarMarcacoesAusentes(
  regra: Regra,
  item: string,
  exigemInterpretacao: ReadonlySet<IdEstudo>,
  exigemPorte: ReadonlySet<IdEstudo>,
  acusar: (item: string, problema: string) => void,
): void {
  const queExigemInterpretacao = regra.estudosDeOrigem.filter((estudo) =>
    exigemInterpretacao.has(estudo),
  );
  if (queExigemInterpretacao.length > 0 && !regra.ehInterpretacao) {
    acusar(
      item,
      `deriva de ${queExigemInterpretacao.join(', ')} e não carrega a marcação de interpretação`,
    );
  }

  const sustentadaApenasPorPorteGrande =
    regra.estudosDeOrigem.length > 0 &&
    regra.estudosDeOrigem.every((estudo) => exigemPorte.has(estudo));
  if (sustentadaApenasPorPorteGrande && !regra.evidenciaApenasDePorteGrande) {
    acusar(
      item,
      `sustenta-se apenas em ${regra.estudosDeOrigem.join(', ')} e não carrega a marcação de porte`,
    );
  }
}

/** Identificador repetido quebra a rastreabilidade de motivo e fonte. */
function acusarIdsRepetidos(
  conteudo: Conteudo,
  acusar: (item: string, problema: string) => void,
): void {
  const colecoes: ReadonlyArray<[string, string, ReadonlyArray<{ id: Id }>]> = [
    ['critério', 'critérios', conteudo.criterios],
    ['pergunta', 'perguntas', conteudo.perguntas],
    ['estratégia', 'estratégias', conteudo.estrategias],
    ['regra', 'regras', conteudo.regras],
    ['estudo', 'estudos', conteudo.estudos],
    ['lista de aviso', 'listas de aviso', conteudo.listasDeAviso ?? []],
  ];

  for (const [singular, plural, itens] of colecoes) {
    const vistos = new Set<Id>();
    for (const item of itens) {
      if (vistos.has(item.id)) {
        acusar(`${singular} ${item.id}`, `identificador repetido entre os ${plural}`);
        continue;
      }
      vistos.add(item.id);
    }
  }

  for (const criterio of conteudo.criterios) {
    const vistos = new Set<Id>();
    for (const valor of criterio.valores) {
      if (vistos.has(valor.id)) {
        acusar(
          `critério ${criterio.id}`,
          `o valor de resposta ${valor.id} aparece mais de uma vez`,
        );
        continue;
      }
      vistos.add(valor.id);
    }
  }

  for (const lista of conteudo.listasDeAviso ?? []) {
    const vistos = new Set<Id>();
    for (const item of lista.itens) {
      if (vistos.has(item.id)) {
        acusar(`lista de aviso ${lista.id}`, `o item ${item.id} aparece mais de uma vez`);
        continue;
      }
      vistos.add(item.id);
    }
  }
}

/**
 * Devolve o conteúdo se ele for consistente.
 *
 * @throws {ErroDeConsistenciaDeConteudo} com todas as divergências encontradas.
 */
export function exigirConteudoConsistente(
  conteudo: Conteudo,
  opcoes: OpcoesDeVerificacao = {},
): Conteudo {
  const divergencias = verificarConsistencia(conteudo, opcoes);
  if (divergencias.length > 0) {
    throw new ErroDeConsistenciaDeConteudo(divergencias);
  }
  return conteudo;
}
