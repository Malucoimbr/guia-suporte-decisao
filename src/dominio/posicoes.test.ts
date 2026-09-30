import { describe, expect, it } from 'vitest';
import {
  RAZAO_SEM_REGRA_CADASTRADA,
  calcularPosicaoDeEstrategia,
  calcularPosicoes,
  estrategiaFixada,
  estrategiasNaoAvaliadas,
} from './posicoes';
import type { Conteudo, Estrategia, Id, Regra, Resposta } from './tipos';

/**
 * O conteúdo é montado aqui, e não lido de `src/conteudo/`: o cálculo precisa
 * valer para qualquer conteúdo editável, e amarrar o teste ao JSON do
 * repositório faria a evolução prevista na Seção 7 do design quebrar testes de
 * mecanismo. Os cenários da Seção 8.1, sobre o conteúdo real, são tarefa à parte
 * (4.4).
 */

function respondeu(criterio: Id, ...valores: Id[]): Resposta {
  return {
    criterio,
    valor: { tipo: 'valores', valores },
    momento: '2026-01-01T10:00:00.000Z',
  };
}

/** Resposta "não sei" (Requisito 3.1). */
function naoSabe(criterio: Id): Resposta {
  return { criterio, valor: { tipo: 'desconhecida' }, momento: '2026-01-01T10:00:00.000Z' };
}

/** Contribuição: o efeito da maioria das regras da Seção 4.6 dos requisitos. */
function contribuicao(
  id: Id,
  estrategiaAlvo: Id,
  direcao: 'favor' | 'contra',
  criterio: Id,
  valor: Id,
  marcacoes: Partial<Pick<Regra, 'ehInterpretacao' | 'evidenciaApenasDePorteGrande'>> = {},
): Regra {
  return {
    id,
    condicao: { pares: [{ criterio, valor }], descricao: `${criterio} = ${valor}` },
    estrategiaAlvo,
    tipoDeEfeito: 'contribuicao',
    direcao,
    textoMotivo: `motivo de ${id}`,
    estudosDeOrigem: ['[Fonseca2024]'],
    ehInterpretacao: marcacoes.ehInterpretacao ?? false,
    evidenciaApenasDePorteGrande: marcacoes.evidenciaApenasDePorteGrande ?? false,
  };
}

/**
 * Precondição redigida como incompatibilidade, forma da regra regulatória de
 * [Ramchand2021]: a condição descreve o que elimina a estratégia.
 */
function precondicaoDeIncompatibilidade(
  id: Id,
  estrategiaAlvo: Id,
  criterio: Id,
  valor: Id,
): Regra {
  return {
    ...contribuicao(id, estrategiaAlvo, 'contra', criterio, valor),
    tipoDeEfeito: 'precondicao',
    estudosDeOrigem: ['[Ramchand2021]'],
  };
}

/**
 * Precondição redigida como verificação obrigatória, forma das checagens de PaaS
 * de [Khouibiri2024]: a condição descreve o que precisa valer.
 */
function precondicaoDeVerificacao(id: Id, estrategiaAlvo: Id, criterio: Id, valor: Id): Regra {
  return {
    ...contribuicao(id, estrategiaAlvo, 'favor', criterio, valor),
    tipoDeEfeito: 'precondicao',
    estudosDeOrigem: ['[Khouibiri2024]'],
  };
}

function estrategia(id: Id): Estrategia {
  return { id, nome: id, descricao: `descrição de ${id}`, temCaracterizacaoNoCorpus: true };
}

describe('calcularPosicaoDeEstrategia', () => {
  it('soma +1 por contribuição a favor e −1 por contra, sem pesos diferenciados', () => {
    const regras = [
      contribuicao('R1', 'refactor', 'favor', 'valorDeNegocio', 'alto'),
      contribuicao('R2', 'refactor', 'favor', 'inovacao', 'sim'),
      contribuicao('R3', 'refactor', 'contra', 'volumeDeCodigo', 'grande'),
    ];

    const posicao = calcularPosicaoDeEstrategia('refactor', regras, [
      respondeu('valorDeNegocio', 'alto'),
      respondeu('inovacao', 'sim'),
      respondeu('volumeDeCodigo', 'grande'),
    ]);

    expect(posicao.saldo).toBe(1);
    expect(posicao.faixa).toBe('recomendada');
    expect(posicao.regrasAFavor.map((r) => r.regra)).toEqual(['R1', 'R2']);
    expect(posicao.regrasContra.map((r) => r.regra)).toEqual(['R3']);
  });

  it('coloca em possível o saldo zero e em não recomendada o saldo negativo', () => {
    const regras = [
      contribuicao('R1', 'retain', 'favor', 'carga', 'estavel'),
      contribuicao('R2', 'retain', 'contra', 'riscoFinanceiro', 'sim'),
      contribuicao('R3', 'retain', 'contra', 'fimDeSuporte', 'sim'),
    ];

    const empatada = calcularPosicaoDeEstrategia('retain', regras, [
      respondeu('carga', 'estavel'),
      respondeu('riscoFinanceiro', 'sim'),
    ]);
    expect(empatada.saldo).toBe(0);
    expect(empatada.faixa).toBe('possivel');

    const negativa = calcularPosicaoDeEstrategia('retain', regras, [
      respondeu('carga', 'estavel'),
      respondeu('riscoFinanceiro', 'sim'),
      respondeu('fimDeSuporte', 'sim'),
    ]);
    expect(negativa.saldo).toBe(-1);
    expect(negativa.faixa).toBe('naoRecomendada');
  });

  it('ignora as regras cuja condição não se verifica e as de outra estratégia', () => {
    const regras = [
      contribuicao('R1', 'refactor', 'favor', 'valorDeNegocio', 'alto'),
      contribuicao('R2', 'retain', 'favor', 'carga', 'estavel'),
    ];

    const posicao = calcularPosicaoDeEstrategia('refactor', regras, [
      respondeu('valorDeNegocio', 'baixo'),
      respondeu('carga', 'estavel'),
    ]);

    expect(posicao.regrasAFavor).toEqual([]);
    expect(posicao.saldo).toBe(0);
    expect(posicao.nenhumaRegraAplicada).toBe(true);
  });

  it('leva a estratégia para não recomendada quando a incompatibilidade se verifica, qualquer que seja o saldo', () => {
    const regras = [
      contribuicao('R1', 'replatform', 'favor', 'valorDeNegocio', 'alto'),
      contribuicao('R2', 'replatform', 'favor', 'inovacao', 'sim'),
      precondicaoDeIncompatibilidade('R3', 'replatform', 'regulacao', 'sim'),
    ];

    const posicao = calcularPosicaoDeEstrategia('replatform', regras, [
      respondeu('valorDeNegocio', 'alto'),
      respondeu('inovacao', 'sim'),
      respondeu('regulacao', 'sim'),
    ]);

    // Seção 5.1 do design: nenhuma soma de contribuições tira a estratégia de lá.
    expect(posicao.saldo).toBe(2);
    expect(posicao.faixa).toBe('naoRecomendada');
    expect(posicao.precondicoesFalhadas.map((r) => r.regra)).toEqual(['R3']);
    expect(estrategiaFixada(posicao)).toBe(true);
  });

  it('falha a verificação obrigatória quando a resposta registrada a contradiz', () => {
    const regras = [precondicaoDeVerificacao('R1', 'replatform', 'bancoCompativel', 'sim')];

    const posicao = calcularPosicaoDeEstrategia('replatform', regras, [
      respondeu('bancoCompativel', 'nao'),
    ]);

    // [Khouibiri2024] declara a verificação obrigatória: reprovada, Replatform sai.
    expect(posicao.faixa).toBe('naoRecomendada');
    expect(posicao.precondicoesFalhadas).toHaveLength(1);
    // O motivo do descarte carrega a resposta que reprovou a verificação
    // (Requisito 2.4).
    expect(posicao.precondicoesFalhadas[0].respostasQueSatisfizeram).toEqual([
      respondeu('bancoCompativel', 'nao'),
    ]);
  });

  it('não pontua a verificação obrigatória que passou', () => {
    const regras = [precondicaoDeVerificacao('R1', 'replatform', 'bancoCompativel', 'sim')];

    const posicao = calcularPosicaoDeEstrategia('replatform', regras, [
      respondeu('bancoCompativel', 'sim'),
    ]);

    // Cumprir a verificação não é evidência a favor da estratégia.
    expect(posicao.saldo).toBe(0);
    expect(posicao.faixa).toBe('possivel');
    expect(posicao.regrasAFavor).toEqual([]);
    expect(posicao.precondicoesFalhadas).toEqual([]);
    expect(posicao.nenhumaRegraAplicada).toBe(true);
  });

  it('não elimina a estratégia quando a precondição foi respondida com "não sei"', () => {
    const regras = [
      precondicaoDeIncompatibilidade('R1', 'refactor', 'regulacao', 'sim'),
      precondicaoDeVerificacao('R2', 'replatform', 'bancoCompativel', 'sim'),
    ];

    const refactor = calcularPosicaoDeEstrategia('refactor', regras, [naoSabe('regulacao')]);
    const replatform = calcularPosicaoDeEstrategia('replatform', regras, [
      naoSabe('bancoCompativel'),
    ]);

    // Requisito 3.3 e Seção 4.3 do design: na dúvida, a estratégia permanece.
    for (const posicao of [refactor, replatform]) {
      expect(posicao.precondicoesFalhadas).toEqual([]);
      expect(posicao.faixa).toBe('possivel');
      expect(estrategiaFixada(posicao)).toBe(false);
    }
  });

  it('não elimina a estratégia quando a precondição ainda não foi perguntada', () => {
    const regras = [precondicaoDeIncompatibilidade('R1', 'refactor', 'regulacao', 'sim')];

    const posicao = calcularPosicaoDeEstrategia('refactor', regras, []);

    expect(posicao.faixa).toBe('possivel');
    expect(posicao.precondicoesFalhadas).toEqual([]);
  });

  it('marca evidência dividida quando há regras nas duas direções', () => {
    const regras = [
      contribuicao('R1', 'retain', 'favor', 'carga', 'estavel'),
      contribuicao('R2', 'retain', 'contra', 'riscoFinanceiro', 'sim'),
    ];

    const posicao = calcularPosicaoDeEstrategia('retain', regras, [
      respondeu('carga', 'estavel'),
      respondeu('riscoFinanceiro', 'sim'),
    ]);

    // Cenário de [Dalakas2025] contra [Jose2021]: possível, evidência dividida.
    expect(posicao.faixa).toBe('possivel');
    expect(posicao.evidenciaDividida).toBe(true);
    expect(posicao.nenhumaRegraAplicada).toBe(false);
  });

  it('distingue "nenhuma regra se aplicou" de evidência dividida no mesmo saldo zero', () => {
    const regras = [contribuicao('R1', 'retain', 'favor', 'carga', 'estavel')];

    const posicao = calcularPosicaoDeEstrategia('retain', regras, [respondeu('carga', 'variavel')]);

    // Seção 5.3: no primeiro caso a literatura falou e discordou, aqui não falou.
    expect(posicao.faixa).toBe('possivel');
    expect(posicao.evidenciaDividida).toBe(false);
    expect(posicao.nenhumaRegraAplicada).toBe(true);
  });

  it('devolve o rastro de cada regra acionada: condição, respostas e estudos', () => {
    const regra: Regra = {
      id: 'R1',
      condicao: {
        pares: [
          { criterio: 'valorDeNegocio', valor: 'alto' },
          { criterio: 'qualidadeTecnica', valor: 'ruim' },
        ],
        descricao: 'A aplicação tem alto valor para o negócio e saúde técnica ruim',
      },
      estrategiaAlvo: 'refactor',
      tipoDeEfeito: 'contribuicao',
      direcao: 'favor',
      textoMotivo: 'Reengenharia para tratar o débito técnico',
      estudosDeOrigem: ['[Kirkila2025]', '[Fonseca2024]'],
      ehInterpretacao: true,
      evidenciaApenasDePorteGrande: false,
    };
    const valor = respondeu('valorDeNegocio', 'alto');
    const qualidade = respondeu('qualidadeTecnica', 'ruim');

    const posicao = calcularPosicaoDeEstrategia('refactor', [regra], [valor, qualidade]);

    const acionada = posicao.regrasAFavor[0];
    expect(acionada.condicaoSatisfeita).toEqual(regra.condicao);
    expect(acionada.respostasQueSatisfizeram).toEqual([valor, qualidade]);
    expect(acionada.textoMotivo).toBe(regra.textoMotivo);
    // Requisito 2.3: a referência do estudo acompanha a posição.
    expect(acionada.estudosDeOrigem).toEqual(['[Kirkila2025]', '[Fonseca2024]']);
  });

  it('propaga as marcações de interpretação e de porte só das regras acionadas', () => {
    const regras = [
      contribuicao('R1', 'repurchase', 'favor', 'equivalenteSaaS', 'sim', {
        ehInterpretacao: true,
      }),
      contribuicao('R2', 'repurchase', 'contra', 'riscoFinanceiro', 'sim', {
        evidenciaApenasDePorteGrande: true,
      }),
    ];

    const soAInterpretacao = calcularPosicaoDeEstrategia('repurchase', regras, [
      respondeu('equivalenteSaaS', 'sim'),
    ]);
    expect(soAInterpretacao.temMarcacaoDeInterpretacao).toBe(true);
    // A regra de porte não foi acionada, então a marcação não aparece.
    expect(soAInterpretacao.temMarcacaoDePorte).toBe(false);

    const asDuas = calcularPosicaoDeEstrategia('repurchase', regras, [
      respondeu('equivalenteSaaS', 'sim'),
      respondeu('riscoFinanceiro', 'sim'),
    ]);
    expect(asDuas.temMarcacaoDeInterpretacao).toBe(true);
    expect(asDuas.temMarcacaoDePorte).toBe(true);
  });

  it('propaga a marcação da precondição que falhou', () => {
    const regra: Regra = {
      ...precondicaoDeIncompatibilidade('R1', 'refactor', 'regulacao', 'sim'),
      evidenciaApenasDePorteGrande: true,
    };

    const posicao = calcularPosicaoDeEstrategia('refactor', [regra], [respondeu('regulacao', 'sim')]);

    expect(posicao.temMarcacaoDePorte).toBe(true);
  });
});

describe('calcularPosicoes', () => {
  const conteudo: Conteudo = {
    criterios: [],
    perguntas: [],
    estrategias: [
      estrategia('retain'),
      estrategia('rehost'),
      estrategia('refactor'),
      estrategia('relocate'),
    ],
    regras: [
      contribuicao('R1', 'refactor', 'favor', 'valorDeNegocio', 'alto'),
      contribuicao('R2', 'refactor', 'favor', 'inovacao', 'sim'),
      contribuicao('R3', 'rehost', 'favor', 'prazoParaReengenharia', 'nao'),
      contribuicao('R4', 'retain', 'contra', 'fimDeSuporte', 'sim'),
    ],
    estudos: [],
  };

  it('ordena por faixa e, dentro dela, por saldo decrescente', () => {
    const posicoes = calcularPosicoes(conteudo, [
      respondeu('valorDeNegocio', 'alto'),
      respondeu('inovacao', 'sim'),
      respondeu('prazoParaReengenharia', 'nao'),
      respondeu('fimDeSuporte', 'sim'),
    ]);

    expect(posicoes.map((p) => [p.estrategia, p.faixa])).toEqual([
      ['refactor', 'recomendada'],
      ['rehost', 'recomendada'],
      ['retain', 'naoRecomendada'],
    ]);
  });

  it('deixa de fora a estratégia que nenhuma regra do conteúdo menciona', () => {
    const posicoes = calcularPosicoes(conteudo, []);

    // Seção 5.4 do design: Relocate não é pontuada nem colocada nas faixas;
    // pertence ao grupo "não avaliada pelo Guia", montado à parte.
    expect(posicoes.map((p) => p.estrategia)).not.toContain('relocate');
    expect(posicoes).toHaveLength(3);
  });

  it('sem resposta alguma, nada é descartado e nada é recomendado', () => {
    const posicoes = calcularPosicoes(conteudo, []);

    expect(posicoes.every((p) => p.faixa === 'possivel')).toBe(true);
    expect(posicoes.every((p) => p.nenhumaRegraAplicada)).toBe(true);
  });
});

describe('estrategiasNaoAvaliadas', () => {
  /** Estratégia que entra nos 7Rs sem caracterização no corpus (Seção 6.1 dos requisitos). */
  function semCaracterizacao(id: Id): Estrategia {
    return { ...estrategia(id), temCaracterizacaoNoCorpus: false };
  }

  const conteudo: Conteudo = {
    criterios: [],
    perguntas: [],
    estrategias: [
      estrategia('retain'),
      estrategia('replatform'),
      semCaracterizacao('repurchase'),
      semCaracterizacao('relocate'),
    ],
    regras: [
      contribuicao('R1', 'retain', 'favor', 'carga', 'estavel'),
      // Repurchase se sustenta só em interpretação, mas se sustenta.
      contribuicao('R2', 'repurchase', 'favor', 'equivalenteSaaS', 'sim', {
        ehInterpretacao: true,
      }),
      // Replatform é mencionada apenas por precondição: continua avaliada.
      precondicaoDeVerificacao('R3', 'replatform', 'bancoCompativel', 'sim'),
    ],
    estudos: [],
  };

  it('devolve, com a razão explícita, a estratégia que nenhuma regra menciona', () => {
    // Seção 5.4 do design: hoje Relocate é a única nesse caso.
    expect(estrategiasNaoAvaliadas(conteudo)).toEqual([
      { estrategia: 'relocate', razao: RAZAO_SEM_REGRA_CADASTRADA },
    ]);
    expect(RAZAO_SEM_REGRA_CADASTRADA).toMatch(/recomendá-la ou descartá-la/);
  });

  it('não devolve a estratégia mencionada por alguma regra, mesmo sem caracterização no corpus', () => {
    const naoAvaliadas = estrategiasNaoAvaliadas(conteudo).map((e) => e.estrategia);

    // O que separa os grupos é existir regra, não a qualidade da evidência:
    // Repurchase tem regra com marcação de interpretação, e isso basta.
    expect(naoAvaliadas).not.toContain('repurchase');
    // Precondição também é menção.
    expect(naoAvaliadas).not.toContain('replatform');
  });

  it('não pontua nem coloca nas três faixas a estratégia não avaliada', () => {
    const respostas = [respondeu('carga', 'estavel'), respondeu('equivalenteSaaS', 'sim')];

    const posicoes = calcularPosicoes(conteudo, respostas);
    const naoAvaliadas = estrategiasNaoAvaliadas(conteudo);

    // Complementaridade: cada estratégia cadastrada está em exatamente um dos
    // dois lugares. Nada fica de fora do resultado e nada aparece duas vezes.
    const nasFaixas = posicoes.map((p) => p.estrategia);
    const foraDelas = naoAvaliadas.map((e) => e.estrategia);
    expect(nasFaixas).not.toContain('relocate');
    expect([...nasFaixas, ...foraDelas].sort()).toEqual(
      conteudo.estrategias.map((e) => e.id).sort(),
    );
  });

  it('não depende das respostas registradas', () => {
    // A ausência de regra é propriedade do conteúdo, não do cenário informado.
    const semNada = estrategiasNaoAvaliadas(conteudo);
    expect(semNada).toEqual(estrategiasNaoAvaliadas(conteudo));

    const posicoesSemResposta = calcularPosicoes(conteudo, []);
    const posicoesRespondidas = calcularPosicoes(conteudo, [naoSabe('carga')]);
    expect(posicoesSemResposta.map((p) => p.estrategia)).toEqual(
      posicoesRespondidas.map((p) => p.estrategia),
    );
  });

  it('esvazia o grupo quando o conteúdo passa a ter regra para a estratégia', () => {
    const comRegraParaRelocate: Conteudo = {
      ...conteudo,
      regras: [
        ...conteudo.regras,
        contribuicao('R4', 'relocate', 'favor', 'saidaDoDatacenter', 'sim'),
      ],
    };

    // Seção 5.4: o grupo desaparece sozinho, sem alteração do mecanismo, e a
    // estratégia passa a ser pontuada como qualquer outra.
    expect(estrategiasNaoAvaliadas(comRegraParaRelocate)).toEqual([]);

    const posicoes = calcularPosicoes(comRegraParaRelocate, [
      respondeu('saidaDoDatacenter', 'sim'),
    ]);
    const relocate = posicoes.find((p) => p.estrategia === 'relocate');
    expect(relocate?.faixa).toBe('recomendada');
    expect(relocate?.saldo).toBe(1);
  });
});
