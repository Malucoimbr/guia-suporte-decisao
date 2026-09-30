import { describe, expect, it } from 'vitest';
import { carregarConteudo } from './carga';
import { calcularPosicaoDeEstrategia, calcularPosicoes, estrategiaFixada } from './posicoes';
import type { Conteudo, Id, PosicaoDeEstrategia, Resposta } from './tipos';

/**
 * Cenários conhecidos da Seção 8.1 do design (Tarefa 4.4; Requisitos 2.1 a 2.5).
 *
 * `posicoes.test.ts` exercita o mecanismo sobre conteúdo montado à mão. Aqui o
 * alvo é o outro: as regras **como estão cadastradas** em `src/conteudo/`,
 * confrontadas com os oito cenários que o corpus descreve. Cada cenário fixa as
 * respostas indicadas no design e verifica a faixa esperada de cada estratégia
 * envolvida, mais o rastro que a justifica — o texto do motivo, a referência do
 * estudo e, quando é o caso, a precondição que falhou, a evidência dividida, a
 * ausência de regra aplicada e as marcações de interpretação e de porte.
 *
 * É o teste que a evolução do conteúdo prevista na Seção 7 do design tem de
 * manter verde: se uma regra sair do lugar, é o cenário do artigo que deixa de
 * se reproduzir, e isso precisa aparecer aqui em vez de passar em silêncio.
 */

const conteudo: Conteudo = carregarConteudo();

const MOMENTO = '2026-01-01T10:00:00.000Z';

/**
 * Resposta a um critério, conferindo contra o conteúdo cadastrado.
 *
 * A conferência não é zelo excessivo: identificador de critério ou de valor
 * escrito errado produziria condição indeterminada, e o cenário passaria a
 * afirmar outra coisa sem que nada falhasse. Aqui ele falha alto.
 */
function resposta(criterio: Id, valor: Id): Resposta {
  const cadastrado = conteudo.criterios.find((item) => item.id === criterio);
  if (cadastrado === undefined) {
    throw new Error(`critério ${criterio} não está cadastrado em criterios.json`);
  }
  if (!cadastrado.valores.some((item) => item.id === valor)) {
    throw new Error(`valor ${valor} não está cadastrado no critério ${criterio}`);
  }
  return { criterio, valor: { tipo: 'valores', valores: [valor] }, momento: MOMENTO };
}

function posicaoDe(estrategia: Id, respostas: readonly Resposta[]): PosicaoDeEstrategia {
  return calcularPosicaoDeEstrategia(estrategia, conteudo.regras, respostas);
}

/** Identificadores das regras acionadas em cada direção, para leitura direta. */
function aFavor(posicao: PosicaoDeEstrategia): Id[] {
  return posicao.regrasAFavor.map((regra) => regra.regra);
}

function contra(posicao: PosicaoDeEstrategia): Id[] {
  return posicao.regrasContra.map((regra) => regra.regra);
}

/**
 * Toda regra acionada carrega motivo e fonte (Requisitos 2.2 e 2.3). É a
 * exigência que vale em qualquer cenário, verificada em todos eles.
 */
function expectarMotivoEFonte(posicao: PosicaoDeEstrategia): void {
  const acionadas = [
    ...posicao.regrasAFavor,
    ...posicao.regrasContra,
    ...posicao.precondicoesFalhadas,
  ];
  for (const acionada of acionadas) {
    expect(acionada.textoMotivo.trim(), `motivo de ${acionada.regra}`).not.toBe('');
    expect(acionada.estudosDeOrigem.length, `fonte de ${acionada.regra}`).toBeGreaterThan(0);
    expect(
      acionada.condicaoSatisfeita.descricao.trim(),
      `condição de ${acionada.regra}`,
    ).not.toBe('');
    expect(
      acionada.respostasQueSatisfizeram.length,
      `respostas que acionaram ${acionada.regra}`,
    ).toBeGreaterThan(0);
    for (const estudo of acionada.estudosDeOrigem) {
      expect(
        conteudo.estudos.map((item) => item.id),
        `estudo de ${acionada.regra} cadastrado`,
      ).toContain(estudo);
    }
  }
}

describe('cenário: fim de suporte com aplicação valiosa e endividada, de [Fonseca2024]', () => {
  const respostas = [
    resposta('valorDeNegocio', 'valorDeNegocioAlto'),
    resposta('qualidadeTecnica', 'qualidadeTecnicaRuim'),
    resposta('fimDeSuporte', 'fimDeSuporteComPrazo'),
    resposta('volumeDeCodigo', 'volumeDeCodigoGrande'),
    resposta('inovacaoComoPrioridade', 'inovacaoEhPrioridade'),
  ];

  it('recomenda Refactor com evidência dividida por causa do volume de código', () => {
    const refactor = posicaoDe('refactor', respostas);

    expect(refactor.faixa).toBe('recomendada');
    // Débito técnico com alto valor de negócio e inovação como objetivo, contra
    // o risco que cresce com o volume de código.
    expect(aFavor(refactor)).toEqual(['R06', 'R07']);
    expect(contra(refactor)).toEqual(['R25']);
    expect(refactor.evidenciaDividida).toBe(true);
    expect(refactor.nenhumaRegraAplicada).toBe(false);
    // O quadrante de [Kirkila2025] lido em vocabulário dos 7Rs é interpretação
    // da pesquisadora (Requisito 2.5).
    expect(refactor.temMarcacaoDeInterpretacao).toBe(true);
    expect(refactor.regrasContra[0]?.estudosDeOrigem).toContain('[Fonseca2024]');
    expectarMotivoEFonte(refactor);
  });

  it('não recomenda Retain, porque o fim de suporte tem data marcada', () => {
    const retain = posicaoDe('retain', respostas);

    expect(retain.faixa).toBe('naoRecomendada');
    expect(aFavor(retain)).toEqual([]);
    expect(contra(retain)).toEqual(['R15']);
    // Não é descarte por precondição: são as contribuições que o levam para lá.
    expect(retain.precondicoesFalhadas).toEqual([]);
    expect(estrategiaFixada(retain)).toBe(false);
    expect(retain.regrasContra[0]?.estudosDeOrigem).toEqual(['[Fonseca2024]']);
    expectarMotivoEFonte(retain);
  });
});

describe('cenário: carga estável e previsível, de [Dalakas2025]', () => {
  const respostas = [
    resposta('previsibilidadeDaCarga', 'cargaEstavelEPrevisivel'),
    resposta('prioridadeDeRiscoFinanceiro', 'riscoFinanceiroNaoEhPrioridade'),
  ];

  it('recomenda Retain, com motivo que cita contrato e depreciação', () => {
    const retain = posicaoDe('retain', respostas);

    expect(retain.faixa).toBe('recomendada');
    expect(aFavor(retain)).toEqual(['R17']);
    expect(contra(retain)).toEqual([]);
    expect(retain.evidenciaDividida).toBe(false);

    const motivo = retain.regrasAFavor[0]?.textoMotivo ?? '';
    expect(motivo).toMatch(/contrato/i);
    expect(motivo).toMatch(/deprecia/i);
    expect(retain.regrasAFavor[0]?.estudosDeOrigem).toEqual(['[Dalakas2025]']);
    // A evidência vem de organizações acima de 250 funcionários (Requisito 4.5).
    expect(retain.temMarcacaoDePorte).toBe(true);
    expectarMotivoEFonte(retain);
  });

  it('desfavorece mover para a nuvem pública sob esse perfil de carga', () => {
    const rehost = posicaoDe('rehost', respostas);
    const replatform = posicaoDe('replatform', respostas);

    expect(rehost.faixa).toBe('naoRecomendada');
    expect(contra(rehost)).toEqual(['R18']);
    expect(replatform.faixa).toBe('naoRecomendada');
    expect(contra(replatform)).toEqual(['R19']);
    expect(rehost.temMarcacaoDePorte).toBe(true);
    expect(replatform.temMarcacaoDePorte).toBe(true);
  });
});

describe('cenário: carga previsível com risco financeiro em primeiro plano', () => {
  const respostas = [
    resposta('previsibilidadeDaCarga', 'cargaEstavelEPrevisivel'),
    resposta('prioridadeDeRiscoFinanceiro', 'riscoFinanceiroEhPrioridade'),
  ];

  it('deixa Retain possível com evidência dividida entre [Dalakas2025] e [Jose2021]', () => {
    const retain = posicaoDe('retain', respostas);

    expect(retain.faixa).toBe('possivel');
    expect(retain.saldo).toBe(0);
    expect(aFavor(retain)).toEqual(['R17']);
    expect(contra(retain)).toEqual(['R22']);
    // Divergência D3 dos requisitos: a literatura falou e discordou. É o que
    // distingue este "possível" do "possível porque nenhuma regra se aplicou".
    expect(retain.evidenciaDividida).toBe(true);
    expect(retain.nenhumaRegraAplicada).toBe(false);
    expect(retain.regrasAFavor[0]?.estudosDeOrigem).toEqual(['[Dalakas2025]']);
    expect(retain.regrasContra[0]?.estudosDeOrigem).toEqual(['[Jose2021]']);
    expect(retain.temMarcacaoDePorte).toBe(true);
    expectarMotivoEFonte(retain);
  });
});

describe('cenário: componente sob restrição regulatória, de [Ramchand2021]', () => {
  const respostas = [resposta('restricaoRegulatoria', 'haRestricaoRegulatoria')];

  it('recomenda Retain enquanto a exigência vigora', () => {
    const retain = posicaoDe('retain', respostas);

    expect(retain.faixa).toBe('recomendada');
    expect(aFavor(retain)).toEqual(['R10']);
    expect(retain.regrasAFavor[0]?.estudosDeOrigem).toEqual(['[Ramchand2021]']);
    expect(estrategiaFixada(retain)).toBe(false);
    expectarMotivoEFonte(retain);
  });

  it.each([
    ['rehost', 'R11'],
    ['replatform', 'R12'],
    ['refactor', 'R13'],
    ['repurchase', 'R14'],
  ])('tira %s de circulação por precondição falhada', (estrategia, regra) => {
    const posicao = posicaoDe(estrategia, respostas);

    expect(posicao.faixa).toBe('naoRecomendada');
    expect(estrategiaFixada(posicao)).toBe(true);
    expect(posicao.precondicoesFalhadas.map((item) => item.regra)).toEqual([regra]);
    // Motivo do descarte (Requisito 2.4): a resposta que fez a precondição
    // falhar acompanha a regra.
    expect(posicao.precondicoesFalhadas[0]?.respostasQueSatisfizeram).toEqual([respostas[0]]);
    expect(posicao.precondicoesFalhadas[0]?.estudosDeOrigem).toEqual(['[Ramchand2021]']);
    expectarMotivoEFonte(posicao);
  });

  it('não fixa Retire, que nada tem a ver com a exigência regulatória', () => {
    const retire = posicaoDe('retire', respostas);

    expect(estrategiaFixada(retire)).toBe(false);
    expect(retire.nenhumaRegraAplicada).toBe(true);
    expect(retire.faixa).toBe('possivel');
  });
});

describe('cenário: aplicação prevista para desativação', () => {
  const respostas = [resposta('usoDaAplicacao', 'previstaParaDesativacao')];

  it('recomenda Retire', () => {
    const retire = posicaoDe('retire', respostas);

    expect(retire.faixa).toBe('recomendada');
    expect(aFavor(retire)).toEqual(['R08']);
    expect(contra(retire)).toEqual([]);
    expect(retire.regrasAFavor[0]?.estudosDeOrigem).toEqual(['[Ramchand2021]']);
    expectarMotivoEFonte(retire);
  });

  it.each(['retain', 'rehost', 'replatform', 'refactor', 'repurchase'])(
    'deixa %s como possível sem nenhuma regra aplicada',
    (estrategia) => {
      const posicao = posicaoDe(estrategia, respostas);

      // Nada foi descartado e nada foi avaliado: a única resposta registrada não
      // aciona regra dessas estratégias. É o "possível" que a Seção 5.3 do
      // design distingue do "possível com evidência dividida".
      expect(posicao.faixa).toBe('possivel');
      expect(posicao.nenhumaRegraAplicada).toBe(true);
      expect(posicao.evidenciaDividida).toBe(false);
      expect(estrategiaFixada(posicao)).toBe(false);
    },
  );

  it('apresenta Retire à frente das demais no quadro final', () => {
    const posicoes = calcularPosicoes(conteudo, respostas);

    expect(posicoes[0]?.estrategia).toBe('retire');
    expect(posicoes[0]?.faixa).toBe('recomendada');
    // Relocate não entra nas faixas: não tem regra cadastrada (Seção 5.4).
    expect(posicoes.map((posicao) => posicao.estrategia)).not.toContain('relocate');
  });
});

describe('cenário: alvo PaaS incompatível, de [Khouibiri2024]', () => {
  // Replatform estava em jogo — e mais do que isso, com saldo positivo — quando
  // a verificação de banco de dados falhou.
  const respostas = [
    resposta('usoDaAplicacao', 'continuaEmUso'),
    resposta('restricaoRegulatoria', 'semRestricaoRegulatoria'),
    resposta('previsibilidadeDaCarga', 'cargaVariavelOuSazonal'),
    resposta('competenciaInternaEmNuvem', 'temCompetenciaInterna'),
    resposta('compatibilidadeDeBanco', 'bancoSemEquivalente'),
  ];

  it('tira Replatform de circulação, com motivo na verificação que falhou', () => {
    const replatform = posicaoDe('replatform', respostas);

    expect(replatform.faixa).toBe('naoRecomendada');
    expect(estrategiaFixada(replatform)).toBe(true);
    // Precondição falhada fixa a estratégia: o saldo positivo não a tira de lá
    // (Seção 5.1 do design).
    expect(aFavor(replatform)).toEqual(['R21', 'R32']);
    expect(replatform.saldo).toBeGreaterThan(0);

    expect(replatform.precondicoesFalhadas.map((item) => item.regra)).toEqual(['R38']);
    const falhada = replatform.precondicoesFalhadas[0];
    expect(falhada?.textoMotivo).toMatch(/banco de dados/i);
    expect(falhada?.textoMotivo).toMatch(/equivalente/i);
    expect(falhada?.estudosDeOrigem).toEqual(['[Khouibiri2024]']);
    expect(falhada?.respostasQueSatisfizeram.map((item) => item.criterio)).toEqual([
      'compatibilidadeDeBanco',
    ]);
    expectarMotivoEFonte(replatform);
  });

  it('não descarta Rehost nem Refactor, que não dependem dessa verificação', () => {
    expect(estrategiaFixada(posicaoDe('rehost', respostas))).toBe(false);
    expect(estrategiaFixada(posicaoDe('refactor', respostas))).toBe(false);
  });
});

describe('cenário: sem prazo para reengenharia', () => {
  const respostas = [resposta('tempoParaReengenharia', 'semTempoParaReengenharia')];

  it('recomenda Rehost e não recomenda Refactor', () => {
    const rehost = posicaoDe('rehost', respostas);
    const refactor = posicaoDe('refactor', respostas);

    expect(rehost.faixa).toBe('recomendada');
    expect(aFavor(rehost)).toEqual(['R23']);
    expect(rehost.regrasAFavor[0]?.estudosDeOrigem).toEqual([
      '[Khouibiri2024]',
      '[Bremer2021]',
    ]);

    expect(refactor.faixa).toBe('naoRecomendada');
    expect(contra(refactor)).toEqual(['R24']);
    // Descarte por contribuição, não por precondição: mais informação pode
    // trazer Refactor de volta.
    expect(estrategiaFixada(refactor)).toBe(false);

    expectarMotivoEFonte(rehost);
    expectarMotivoEFonte(refactor);
  });
});

describe('cenário: equivalente comercial disponível', () => {
  const respostas = [
    resposta('equivalenteEmSaaS', 'haEquivalenteEmSaaS'),
    resposta('aversaoAAprisionamento', 'semAversaoAAprisionamento'),
  ];

  it('recomenda Repurchase, com marcação de interpretação', () => {
    const repurchase = posicaoDe('repurchase', respostas);

    expect(repurchase.faixa).toBe('recomendada');
    expect(aFavor(repurchase)).toEqual(['R35']);
    expect(contra(repurchase)).toEqual([]);
    expect(repurchase.regrasAFavor[0]?.estudosDeOrigem).toEqual(['[Khouibiri2024]']);
    // Ler "substitution by SaaS" como Repurchase é interpretação da
    // pesquisadora (Requisito 2.5, Seção 6.1 dos requisitos).
    expect(repurchase.temMarcacaoDeInterpretacao).toBe(true);
    expectarMotivoEFonte(repurchase);
  });
});
