import { describe, expect, it } from 'vitest';
import { carregarConteudo } from '../dominio/carga';
import { estrategiaFixada } from '../dominio/posicoes';
import type {
  Conteudo,
  Criterio,
  Id,
  Pergunta,
  Resposta,
  Sessao,
  ValorRegistrado,
} from '../dominio/tipos';
import {
  DECLARACAO_SEM_DISTINCAO,
  coletaEncerrada,
  encerrarColeta,
  type ResultadoDaSessao,
} from './encerramento';
import { revisarResposta } from './revisao';
import { diagnosticarPerguntas, proximaPergunta } from './selecao';
import {
  RESPOSTA_DESCONHECIDA,
  abrirSessao,
  registrarResposta,
  type ValorInformado,
} from './sessao';

/**
 * Comportamento da sessão sobre o conteúdo real (Tarefa 5.5, Seção 8.2 do
 * design; Requisitos 1.2, 1.3, 1.4, 1.5, 2.6, 3.3 e 3.4).
 *
 * `selecao.test.ts`, `sessao.test.ts`, `encerramento.test.ts` e
 * `revisao.test.ts` exercitam cada peça do mecanismo sobre conteúdo montado à
 * mão, para isolar o comportamento de uma condição por vez. Aqui o alvo é o
 * outro: a sessão **de ponta a ponta** contra o conteúdo cadastrado em
 * `src/conteudo/` — 18 perguntas em blocos A a F, 40 regras, 7 estratégias.
 *
 * O que se verifica não é a recomendação de cada cenário, que é assunto de
 * `cenarios.test.ts`, mas as cinco afirmações da Seção 8.2 do design sobre a
 * condução da sessão:
 *
 * - a coleta sempre termina, e nenhuma pergunta é repetida;
 * - a economia de perguntas encurta a sessão de verdade quando estratégias saem
 *   de circulação;
 * - "não sei" em tudo encerra normalmente, sem descartar nada, com resultado
 *   parcial e a declaração de que a sessão não distinguiu alternativas;
 * - revisar uma resposta produz o mesmo resultado de uma sessão iniciada já com
 *   o valor novo;
 * - o Bloco F aparece com Replatform em jogo e não aparece quando ela sai.
 *
 * É o teste que a evolução do conteúdo prevista na Seção 7 do design tem de
 * manter verde: acrescentar pergunta que dependa de resposta posterior na ordem
 * dos blocos, ou condição de exibição que nunca se satisfaça, aparece aqui como
 * sessão que não termina ou pergunta que não é feita.
 */

const conteudo: Conteudo = carregarConteudo();

/**
 * Momento fixo em todas as respostas.
 *
 * Não é economia de digitação: a comparação entre a sessão revisada e a sessão
 * iniciada com o valor novo é de igualdade estrutural, e o carimbo de tempo
 * entraria nela pelas respostas que acionaram cada regra.
 */
const MOMENTO = '2026-01-01T10:00:00.000Z';

/** Ordem em que o catálogo real apresenta as perguntas (Seção 4 do design). */
const CATALOGO_NA_ORDEM = [
  'P1',
  'P4',
  'P5',
  'P6',
  'P2',
  'P3',
  'P7',
  'P8',
  'P9',
  'P10',
  'P11',
  'P12',
  'P13',
  'P14',
  'P15',
  'P16',
  'P17',
  'P18',
];

/** As quatro verificações de PaaS de [Khouibiri2024] (Bloco F). */
const BLOCO_F = ['P15', 'P16', 'P17', 'P18'];

/**
 * Escolha de valor para cada critério, usada por quem conduz a sessão.
 *
 * Recebe a pergunta e o critério cadastrado porque uma política pode querer
 * decidir pelo bloco, pelos valores disponíveis ou pelas estratégias afetadas.
 */
type Politica = (pergunta: Pergunta, criterio: Criterio) => ValorInformado;

/** O que sobrou de uma sessão conduzida do início ao encerramento. */
interface Conducao {
  sessao: Sessao;
  /** Identificadores das perguntas apresentadas, na ordem em que apareceram. */
  apresentadas: Id[];
  resultado: ResultadoDaSessao;
}

/** Respostas indexadas por critério, para comparar conteúdo sem depender da ordem. */
function porCriterio(respostas: readonly Resposta[]): Record<Id, ValorRegistrado> {
  return Object.fromEntries(respostas.map((resposta) => [resposta.criterio, resposta.valor]));
}

function criterioDe(id: Id): Criterio {
  const cadastrado = conteudo.criterios.find((item) => item.id === id);
  if (cadastrado === undefined) {
    throw new Error(`critério ${id} não está cadastrado em criterios.json`);
  }
  return cadastrado;
}

/**
 * Conduz uma sessão do início ao fim, respondendo cada pergunta apresentada
 * conforme a política, e devolve o resultado.
 *
 * Recusa duas coisas a cada passo, que são as da Seção 8.2 do design sobre
 * término: pergunta reapresentada e sessão mais longa que o catálogo. O limite é
 * o que transforma "a coleta sempre termina" em teste — sem ele, uma condição de
 * exibição mal cadastrada travaria a suíte em laço infinito em lugar de falhar.
 */
function conduzir(politica: Politica): Conducao {
  let sessao = abrirSessao({ conteudo, id: 'sessao-de-teste', inicio: MOMENTO });
  const apresentadas: Id[] = [];

  for (;;) {
    const pergunta = proximaPergunta(sessao);
    if (pergunta === undefined) break;

    if (apresentadas.includes(pergunta.id)) {
      throw new Error(`a pergunta ${pergunta.id} foi apresentada duas vezes`);
    }
    if (apresentadas.length >= conteudo.perguntas.length) {
      throw new Error(
        `a coleta não terminou dentro do tamanho do catálogo (${conteudo.perguntas.length} perguntas)`,
      );
    }

    apresentadas.push(pergunta.id);
    sessao = registrarResposta(
      sessao,
      pergunta.criterio,
      politica(pergunta, criterioDe(pergunta.criterio)),
      MOMENTO,
    ).sessao;
  }

  return { sessao, apresentadas, resultado: encerrarColeta(sessao) };
}

/** "Não sei" em toda pergunta. */
const sempreDesconhecida: Politica = () => RESPOSTA_DESCONHECIDA;

/**
 * Valores fixados por critério; o que não estiver no mapa é respondido como
 * "não sei". É como os cenários da Seção 8.1 do design são descritos — algumas
 * respostas fixadas, o resto sem informação.
 */
function fixando(escolhas: Readonly<Record<Id, Id>>): Politica {
  return (_pergunta, criterio) => escolhas[criterio.id] ?? RESPOSTA_DESCONHECIDA;
}

/**
 * Sessão respondida por inteiro, sem nenhum "não sei" e sem nenhuma
 * incompatibilidade: as 18 perguntas são apresentadas, inclusive o Bloco F.
 * Serve de base para as comparações de revisão.
 */
const ESCOLHAS_COMPLETAS: Readonly<Record<Id, Id>> = {
  usoDaAplicacao: 'continuaEmUso',
  restricaoRegulatoria: 'semRestricaoRegulatoria',
  fimDeSuporte: 'fimDeSuporteComPrazo',
  previsibilidadeDaCarga: 'cargaVariavelOuSazonal',
  valorDeNegocio: 'valorDeNegocioAlto',
  qualidadeTecnica: 'qualidadeTecnicaRuim',
  tempoParaReengenharia: 'haTempoParaReengenharia',
  volumeDeCodigo: 'volumeDeCodigoModerado',
  acoplamentoDeDependencias: 'haAcoplamentoForte',
  competenciaInternaEmNuvem: 'temCompetenciaInterna',
  aversaoAAprisionamento: 'semAversaoAAprisionamento',
  equivalenteEmSaaS: 'semEquivalenteEmSaaS',
  prioridadeDeRiscoFinanceiro: 'riscoFinanceiroNaoEhPrioridade',
  inovacaoComoPrioridade: 'inovacaoEhPrioridade',
  compatibilidadeDeLinguagem: 'linguagemSuportada',
  compatibilidadeDeBanco: 'bancoComEquivalente',
  adaptacaoDeMiddleware: 'middlewareAdaptavel',
  bibliotecasSobRestricoesDaPlataforma: 'bibliotecasCompativeis',
};

// ---------------------------------------------------------------------------
// A coleta sempre termina, sem repetir pergunta
// ---------------------------------------------------------------------------

describe('a coleta termina sem repetir pergunta', () => {
  /**
   * Um percurso por cenário da Seção 8.1 do design: as respostas do cenário
   * são fixadas e o restante fica sem informação, que é como o cenário está
   * descrito. O que se verifica é o percurso, não a recomendação — as faixas
   * esperadas de cada cenário estão em `cenarios.test.ts`.
   */
  const cenarios: ReadonlyArray<readonly [string, Readonly<Record<Id, Id>>]> = [
    [
      'fim de suporte com aplicação valiosa e endividada',
      {
        valorDeNegocio: 'valorDeNegocioAlto',
        qualidadeTecnica: 'qualidadeTecnicaRuim',
        fimDeSuporte: 'fimDeSuporteComPrazo',
        volumeDeCodigo: 'volumeDeCodigoGrande',
        inovacaoComoPrioridade: 'inovacaoEhPrioridade',
      },
    ],
    [
      'carga estável e previsível',
      {
        previsibilidadeDaCarga: 'cargaEstavelEPrevisivel',
        prioridadeDeRiscoFinanceiro: 'riscoFinanceiroNaoEhPrioridade',
      },
    ],
    [
      'carga previsível com risco financeiro em primeiro plano',
      {
        previsibilidadeDaCarga: 'cargaEstavelEPrevisivel',
        prioridadeDeRiscoFinanceiro: 'riscoFinanceiroEhPrioridade',
      },
    ],
    ['componente sob restrição regulatória', { restricaoRegulatoria: 'haRestricaoRegulatoria' }],
    ['aplicação prevista para desativação', { usoDaAplicacao: 'previstaParaDesativacao' }],
    ['alvo PaaS incompatível', { compatibilidadeDeBanco: 'bancoSemEquivalente' }],
    ['sem prazo para reengenharia', { tempoParaReengenharia: 'semTempoParaReengenharia' }],
    [
      'equivalente comercial disponível',
      {
        equivalenteEmSaaS: 'haEquivalenteEmSaaS',
        aversaoAAprisionamento: 'semAversaoAAprisionamento',
      },
    ],
    ['sessão inteira respondida', ESCOLHAS_COMPLETAS],
  ];

  it.each(cenarios)('%s', (_nome, escolhas) => {
    const { sessao, apresentadas, resultado } = conduzir(fixando(escolhas));

    // Encerramento por esgotamento, e não por decisão de quem conduz.
    expect(coletaEncerrada(sessao)).toBe(true);
    expect(resultado.motivoDeEncerramento).toBe('semPerguntaCapazDeAlterar');
    expect(resultado.perguntasNaoApresentadas).toEqual([]);
    expect(resultado.criteriosNaoPerguntados).toEqual([]);

    // Sem repetição — `conduzir` já falharia antes — e sem pergunta fora do
    // catálogo, na ordem de bloco e de ordem interna.
    expect(new Set(apresentadas).size).toBe(apresentadas.length);
    expect(apresentadas).toEqual(CATALOGO_NA_ORDEM.filter((id) => apresentadas.includes(id)));

    // Toda resposta fixada pelo cenário foi de fato colhida: se a pergunta não
    // tivesse sido apresentada, o cenário não estaria sendo exercitado.
    for (const criterio of Object.keys(escolhas)) {
      expect(
        sessao.respostas.map((resposta) => resposta.criterio),
        `o cenário fixa ${criterio}, mas a pergunta não foi apresentada`,
      ).toContain(criterio);
    }
  });

  /**
   * Percursos gerados por sorteio determinístico, para cobrir combinações que
   * os cenários do design não descrevem.
   *
   * Não é teste baseado em propriedades: não há gerador de espaço de entrada
   * nem redução de contraexemplo, e a Seção 8 do design descarta esse tipo de
   * teste. É uma varredura de exemplos com semente fixa — mesma sequência em
   * toda execução, e portanto mesma falha quando houver falha.
   */
  it('termina em qualquer combinação de respostas sorteada', () => {
    for (let semente = 1; semente <= 60; semente += 1) {
      const sortear = geradorDeterministico(semente);
      const { sessao, apresentadas, resultado } = conduzir((_pergunta, criterio) => {
        const indice = Math.floor(sortear() * (criterio.valores.length + 1));
        // O último índice é "não sei", que é valor de todo critério
        // (Requisito 3.1) e portanto parte do espaço de respostas possíveis.
        return criterio.valores[indice]?.id ?? RESPOSTA_DESCONHECIDA;
      });

      expect(coletaEncerrada(sessao), `semente ${semente}`).toBe(true);
      expect(resultado.motivoDeEncerramento).toBe('semPerguntaCapazDeAlterar');
      expect(new Set(apresentadas).size, `semente ${semente}`).toBe(apresentadas.length);
      // O Bloco A é a única pergunta que aparece em toda sessão: nada a
      // condiciona, e nenhuma resposta anterior existe para tirá-la de
      // circulação (Requisito 1.1).
      expect(apresentadas[0], `semente ${semente}`).toBe('P1');
    }
  });
});

/**
 * Gerador pseudoaleatório de semente fixa (mulberry32). Determinístico de
 * propósito: uma varredura que muda a cada execução acusaria falha que não se
 * reproduz.
 */
function geradorDeterministico(semente: number): () => number {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let valor = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    valor = (valor + Math.imul(valor ^ (valor >>> 7), 61 | valor)) ^ valor;
    return ((valor ^ (valor >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// "Não sei" em tudo
// ---------------------------------------------------------------------------

describe('"não sei" em todas as perguntas', () => {
  const { sessao, apresentadas, resultado } = conduzir(sempreDesconhecida);

  it('apresenta o catálogo inteiro: "não sei" não tira pergunta de circulação', () => {
    // Nenhuma estratégia é descartada, logo nenhuma pergunta perde utilidade —
    // inclusive o Bloco F, que depende de Replatform continuar em jogo.
    expect(apresentadas).toEqual(CATALOGO_NA_ORDEM);
    expect(resultado.motivoDeEncerramento).toBe('semPerguntaCapazDeAlterar');
  });

  it('encerra com resultado parcial e a lista completa de critérios sem resposta', () => {
    expect(resultado.ehParcial).toBe(true);
    expect(resultado.razoesDeResultadoParcial).toEqual(['respostaDesconhecida']);
    // Requisito 3.4: todos os 18 critérios, na ordem do registro.
    expect(resultado.criteriosDeclaradosDesconhecidos).toEqual(
      sessao.respostas.map((resposta) => resposta.criterio),
    );
    expect(resultado.criteriosSemResposta).toHaveLength(conteudo.criterios.length);
    expect(resultado.criteriosNaoPerguntados).toEqual([]);
  });

  it('não descarta estratégia alguma e declara que não distinguiu alternativas', () => {
    // Requisito 3.3: a resposta desconhecida desliga as regras que dependem do
    // critério, sem descartar por isso nenhuma estratégia.
    expect(resultado.naoRecomendadas).toEqual([]);
    expect(resultado.recomendadas).toEqual([]);
    for (const posicao of resultado.posicoes) {
      expect(posicao.faixa, posicao.estrategia).toBe('possivel');
      expect(posicao.saldo, posicao.estrategia).toBe(0);
      // "Possível porque nenhuma regra se aplicou", que a Seção 5.3 do design
      // distingue de "possível com evidência dividida".
      expect(posicao.nenhumaRegraAplicada, posicao.estrategia).toBe(true);
      expect(posicao.evidenciaDividida, posicao.estrategia).toBe(false);
      expect(estrategiaFixada(posicao), posicao.estrategia).toBe(false);
    }

    // Requisito 2.6.
    expect(resultado.naoDistinguiuAlternativas).toBe(true);
    expect(resultado.declaracaoSemDistincao).toBe(DECLARACAO_SEM_DISTINCAO);
  });

  it('mantém Relocate no grupo não avaliado, que não é descarte', () => {
    // Seção 5.4 do design: sem regra cadastrada, a estratégia não é pontuada
    // nem colocada nas faixas — e não conta como alternativa distinguida.
    expect(resultado.naoAvaliadas.map((item) => item.estrategia)).toEqual(['relocate']);
    expect(resultado.naoAvaliadas[0]?.razao.trim()).not.toBe('');
  });
});

describe('"não sei" em precondição não elimina estratégia', () => {
  /** As cinco perguntas de precondição: P4 e o Bloco F. */
  const criteriosDePrecondicao = [
    'restricaoRegulatoria',
    'compatibilidadeDeLinguagem',
    'compatibilidadeDeBanco',
    'adaptacaoDeMiddleware',
    'bibliotecasSobRestricoesDaPlataforma',
  ];

  it('deixa as estratégias correspondentes fora de "não recomendada"', () => {
    const escolhas = { ...ESCOLHAS_COMPLETAS };
    for (const criterio of criteriosDePrecondicao) delete escolhas[criterio];

    const { sessao, apresentadas, resultado } = conduzir(fixando(escolhas));

    // As cinco perguntas foram apresentadas e respondidas como "não sei": é
    // resposta registrada, não ausência de resposta.
    expect(resultado.criteriosDeclaradosDesconhecidos).toEqual(criteriosDePrecondicao);
    expect(BLOCO_F.every((id) => apresentadas.includes(id))).toBe(true);

    // Requisito 3.3 e Seção 4.3 do design: na dúvida, a estratégia permanece
    // disponível.
    for (const estrategia of ['rehost', 'replatform', 'refactor', 'repurchase']) {
      const posicao = resultado.posicoes.find((item) => item.estrategia === estrategia);
      expect(posicao?.precondicoesFalhadas, estrategia).toEqual([]);
      expect(estrategiaFixada(posicao!), estrategia).toBe(false);
    }
    expect(resultado.ehParcial).toBe(true);

    // O contraste: a mesma sessão com a exigência regulatória declarada fixa as
    // quatro estratégias que a precondição de [Ramchand2021] alcança.
    const comRestricao = conduzir(
      fixando({ ...escolhas, restricaoRegulatoria: 'haRestricaoRegulatoria' }),
    );
    for (const estrategia of ['rehost', 'replatform', 'refactor', 'repurchase']) {
      const posicao = comRestricao.resultado.posicoes.find(
        (item) => item.estrategia === estrategia,
      );
      expect(posicao?.faixa, estrategia).toBe('naoRecomendada');
      expect(estrategiaFixada(posicao!), estrategia).toBe(true);
    }
    expect(sessao.respostas.length).toBeGreaterThan(comRestricao.sessao.respostas.length);
  });
});

// ---------------------------------------------------------------------------
// Economia de perguntas
// ---------------------------------------------------------------------------

describe('a economia de perguntas encurta a sessão', () => {
  const inteira = conduzir(fixando(ESCOLHAS_COMPLETAS));
  const comRestricao = conduzir(
    fixando({ ...ESCOLHAS_COMPLETAS, restricaoRegulatoria: 'haRestricaoRegulatoria' }),
  );

  it('a sessão com exigência regulatória é mais curta, e só perde o que ficou inútil', () => {
    expect(inteira.apresentadas).toEqual(CATALOGO_NA_ORDEM);
    // Rehost, Replatform, Refactor e Repurchase saem por precondição, e com
    // elas as perguntas que só as afetavam (Requisito 1.4, Seção 4.2 do design).
    expect(comRestricao.apresentadas).toEqual(['P1', 'P4', 'P5', 'P6', 'P2', 'P3', 'P13']);
    expect(comRestricao.apresentadas.length).toBeLessThan(inteira.apresentadas.length);

    // As que sobraram são as que ainda podem mover Retain ou Retire, as duas
    // estratégias que nenhuma precondição alcança.
    for (const id of comRestricao.apresentadas) {
      const pergunta = conteudo.perguntas.find((item) => item.id === id);
      expect(
        pergunta?.estrategiasAfetadas.some(
          (estrategia) => estrategia === 'retain' || estrategia === 'retire',
        ),
        `${id} continuou em circulação`,
      ).toBe(true);
    }
  });

  it('declara o motivo de cada pergunta retirada de circulação', () => {
    const diagnostico = diagnosticarPerguntas(comRestricao.sessao);
    const motivoDe = (id: Id) => diagnostico.find((item) => item.pergunta.id === id)?.motivo;

    // Perguntas que só afetavam estratégias fixadas.
    for (const id of ['P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P14']) {
      expect(motivoDe(id), id).toBe('estrategiasAfetadasFixadas');
    }
    // O Bloco F exige Replatform em jogo, e ela saiu.
    for (const id of BLOCO_F) {
      expect(motivoDe(id), id).toBe('estrategiaExigidaFixada');
    }
    // As apresentadas saem de circulação por já terem resposta, não por
    // deixarem de importar.
    for (const id of comRestricao.apresentadas) {
      expect(motivoDe(id), id).toBe('jaRespondida');
    }
  });

  it('não perguntou, mas também não finge que perguntou: as lacunas ficam declaradas', () => {
    // Pergunta que saiu de circulação por não poder mudar nada não é lacuna
    // (Requisito 3.4 trata da informação ausente, não da dispensada).
    expect(comRestricao.resultado.criteriosNaoPerguntados).toEqual([]);
    expect(comRestricao.resultado.ehParcial).toBe(false);
    expect(comRestricao.resultado.motivoDeEncerramento).toBe('semPerguntaCapazDeAlterar');
  });
});

// ---------------------------------------------------------------------------
// Condicionalidade do Bloco F
// ---------------------------------------------------------------------------

describe('o Bloco F depende de Replatform continuar em jogo', () => {
  it('aparece por inteiro quando Replatform está em jogo ao fim do Bloco E', () => {
    const { apresentadas } = conduzir(fixando(ESCOLHAS_COMPLETAS));

    expect(apresentadas.slice(-4)).toEqual(BLOCO_F);
  });

  it('para no meio do bloco quando uma verificação tira Replatform de circulação', () => {
    // [Khouibiri2024] declara as quatro verificações obrigatórias para alvo
    // PaaS. Falhada a primeira, as outras três não têm o que verificar.
    const { apresentadas, resultado } = conduzir(
      fixando({ ...ESCOLHAS_COMPLETAS, compatibilidadeDeLinguagem: 'linguagemNaoSuportada' }),
    );

    expect(apresentadas).toContain('P15');
    expect(apresentadas).not.toContain('P16');
    expect(apresentadas).not.toContain('P17');
    expect(apresentadas).not.toContain('P18');

    const replatform = resultado.posicoes.find((item) => item.estrategia === 'replatform');
    expect(replatform?.faixa).toBe('naoRecomendada');
    expect(replatform?.precondicoesFalhadas.map((item) => item.regra)).toEqual(['R37']);
  });

  it('não aparece quando Replatform saiu antes do bloco', () => {
    const { apresentadas } = conduzir(
      fixando({ ...ESCOLHAS_COMPLETAS, restricaoRegulatoria: 'haRestricaoRegulatoria' }),
    );

    for (const id of BLOCO_F) expect(apresentadas).not.toContain(id);
  });
});

// ---------------------------------------------------------------------------
// Revisão de resposta
// ---------------------------------------------------------------------------

describe('revisar uma resposta produz o mesmo resultado de uma sessão iniciada com o valor novo', () => {
  it('quando a revisão tira estratégias de circulação', () => {
    // Sessão inteira respondida, e depois a exigência regulatória passa a
    // valer: Rehost, Replatform, Refactor e Repurchase saem por precondição, e
    // as respostas que só existiam por causa delas perdem o fundamento.
    const inteira = conduzir(fixando(ESCOLHAS_COMPLETAS));
    const revisao = revisarResposta(
      inteira.sessao,
      'restricaoRegulatoria',
      'haRestricaoRegulatoria',
      MOMENTO,
    );

    const doZero = conduzir(
      fixando({ ...ESCOLHAS_COMPLETAS, restricaoRegulatoria: 'haRestricaoRegulatoria' }),
    );

    // As respostas que sobraram são as mesmas, na mesma ordem: revisar não
    // reordena a sessão nem faz o critério parecer respondido depois do que
    // veio a seguir.
    expect(revisao.sessao.respostas).toEqual(doZero.sessao.respostas);
    expect(revisao.respostasInvalidadas.map((resposta) => resposta.criterio)).toEqual([
      'tempoParaReengenharia',
      'volumeDeCodigo',
      'acoplamentoDeDependencias',
      'competenciaInternaEmNuvem',
      'aversaoAAprisionamento',
      'equivalenteEmSaaS',
      'inovacaoComoPrioridade',
      'compatibilidadeDeLinguagem',
      'compatibilidadeDeBanco',
      'adaptacaoDeMiddleware',
      'bibliotecasSobRestricoesDaPlataforma',
    ]);

    // O critério da Seção 8.2 do design, em igualdade estrutural: mesmas
    // faixas, mesmas regras acionadas, mesmas marcações, mesmas lacunas.
    expect(encerrarColeta(revisao.sessao)).toEqual(doZero.resultado);
    expect(revisao.posicoes).toEqual(doZero.resultado.posicoes);
    expect(revisao.proximaPergunta).toBeUndefined();
  });

  it('quando a revisão devolve estratégias ao jogo', () => {
    // O caminho inverso: perguntas que a sessão havia saltado voltam a
    // circular, e são perguntadas de novo em lugar de presumidas.
    const comRestricao = conduzir(
      fixando({ ...ESCOLHAS_COMPLETAS, restricaoRegulatoria: 'haRestricaoRegulatoria' }),
    );
    const revisao = revisarResposta(
      comRestricao.sessao,
      'restricaoRegulatoria',
      'semRestricaoRegulatoria',
      MOMENTO,
    );

    expect(revisao.respostasInvalidadas).toEqual([]);
    expect(revisao.proximaPergunta?.id).toBe('P7');
    expect(coletaEncerrada(revisao.sessao)).toBe(false);

    // Retomada a coleta a partir da revisão, o resultado é o da sessão inteira
    // respondida com o valor novo desde o início.
    let sessao = revisao.sessao;
    for (;;) {
      const pergunta = proximaPergunta(sessao);
      if (pergunta === undefined) break;
      sessao = registrarResposta(
        sessao,
        pergunta.criterio,
        ESCOLHAS_COMPLETAS[pergunta.criterio],
        MOMENTO,
      ).sessao;
    }

    const inteira = conduzir(fixando(ESCOLHAS_COMPLETAS));
    // As mesmas respostas, ainda que não na mesma ordem de registro: a resposta
    // revisada mantém a posição que já ocupava, e as perguntas que voltaram a
    // circular são recolhidas depois das que a sessão restrita já tinha colhido.
    // A ordem do registro é história da sessão; o que a Seção 8.2 do design
    // exige igual é o resultado.
    expect(porCriterio(sessao.respostas)).toEqual(porCriterio(inteira.sessao.respostas));
    expect(encerrarColeta(sessao)).toEqual(inteira.resultado);
  });

  it('quando a revisão troca um valor por "não sei"', () => {
    // Revisar para "não sei" desliga as regras do critério e o põe na lista de
    // critérios sem resposta, sem que nada precise ser desfeito: a lista é
    // derivada das respostas registradas (Requisito 3.4).
    const inteira = conduzir(fixando(ESCOLHAS_COMPLETAS));
    const revisao = revisarResposta(
      inteira.sessao,
      'fimDeSuporte',
      RESPOSTA_DESCONHECIDA,
      MOMENTO,
    );

    const escolhasSemFimDeSuporte = { ...ESCOLHAS_COMPLETAS };
    delete escolhasSemFimDeSuporte.fimDeSuporte;
    const doZero = conduzir(fixando(escolhasSemFimDeSuporte));

    expect(revisao.sessao.criteriosSemResposta).toEqual(['fimDeSuporte']);
    expect(revisao.sessao.respostas).toEqual(doZero.sessao.respostas);
    expect(encerrarColeta(revisao.sessao)).toEqual(doZero.resultado);
    expect(doZero.resultado.ehParcial).toBe(true);
  });
});
