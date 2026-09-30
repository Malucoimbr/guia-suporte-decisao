import { describe, expect, it } from 'vitest';
import {
  ErroDeConsistenciaDeConteudo,
  descreverDivergencia,
  exigirConteudoConsistente,
  verificarConsistencia,
} from './consistencia';
import type { Conteudo, Regra } from './tipos';

/**
 * Os testes montam o conteúdo no próprio arquivo, e não leem `src/conteudo/`:
 * a verificação precisa valer para qualquer conteúdo, e o conteúdo do
 * repositório ainda está sendo cadastrado. A conferência sobre os JSON reais é
 * tarefa à parte (3.6).
 */

const conteudoValido: Conteudo = {
  criterios: [
    {
      id: 'valorDeNegocio',
      nome: 'Valor de negócio',
      descricao: 'Valor da aplicação para o negócio hoje.',
      permiteRespostaMultipla: false,
      valores: [
        { id: 'alto', criterio: 'valorDeNegocio', rotulo: 'Alto' },
        { id: 'baixo', criterio: 'valorDeNegocio', rotulo: 'Baixo' },
      ],
    },
    {
      id: 'previsibilidadeDaCarga',
      nome: 'Previsibilidade da carga',
      descricao: 'Comportamento da carga da aplicação ao longo do ano.',
      permiteRespostaMultipla: false,
      valores: [
        { id: 'estavel', criterio: 'previsibilidadeDaCarga', rotulo: 'Estável e previsível' },
        { id: 'variavel', criterio: 'previsibilidadeDaCarga', rotulo: 'Variável ou sazonal' },
      ],
    },
  ],
  perguntas: [
    {
      id: 'P2',
      texto: 'Qual o valor da aplicação para o negócio hoje?',
      criterio: 'valorDeNegocio',
      bloco: 'C',
      ordem: 1,
      estrategiasAfetadas: ['retain'],
      fontes: ['[Kirkila2025]'],
    },
    {
      id: 'P6',
      texto: 'Como se comporta a carga da aplicação ao longo do ano?',
      criterio: 'previsibilidadeDaCarga',
      bloco: 'B',
      ordem: 3,
      condicaoDeExibicao: { estrategiasEmJogo: ['retain'] },
      estrategiasAfetadas: ['retain'],
      fontes: ['[Dalakas2025]'],
    },
  ],
  estrategias: [
    {
      id: 'retain',
      nome: 'Retain',
      descricao: 'Manter a aplicação como está.',
      temCaracterizacaoNoCorpus: true,
    },
  ],
  regras: [
    {
      id: 'R-quadrante-1',
      condicao: {
        pares: [{ criterio: 'valorDeNegocio', valor: 'baixo' }],
        descricao: 'A aplicação tem baixo valor para o negócio',
      },
      estrategiaAlvo: 'retain',
      tipoDeEfeito: 'contribuicao',
      direcao: 'favor',
      textoMotivo: 'Aplicação de baixo valor com boa saúde técnica pede apenas manutenção.',
      estudosDeOrigem: ['[Kirkila2025]'],
      ehInterpretacao: true,
      evidenciaApenasDePorteGrande: false,
    },
    {
      id: 'R-carga-estavel',
      condicao: {
        pares: [{ criterio: 'previsibilidadeDaCarga', valor: 'estavel' }],
        descricao: 'A carga é estável e previsível',
      },
      estrategiaAlvo: 'retain',
      tipoDeEfeito: 'contribuicao',
      direcao: 'favor',
      textoMotivo: 'Sob carga estável, contrato e depreciação favorecem a permanência local.',
      estudosDeOrigem: ['[Dalakas2025]'],
      ehInterpretacao: false,
      evidenciaApenasDePorteGrande: true,
    },
  ],
  estudos: [
    {
      id: '[Kirkila2025]',
      referencia: 'Kirkila et al. (2025)',
      arquivoNoAcervo: 'iee/Case_Study_Review_IT_Legacy_System_Migration_Success_Factors.pdf',
      contextoEmpirico: 'Revisão narrativa e estudos de caso multissetoriais',
      porteAnalisado: 'Porte não especificado',
    },
    {
      id: '[Dalakas2025]',
      referencia: 'Dalakas et al. (2025)',
      arquivoNoAcervo: 'iee/Are_Public_Cloud_Solutions_Really_Cheaper.pdf',
      contextoEmpirico: 'Custo em cinco anos, três modelos',
      porteAnalisado: 'Organização governamental de larga escala',
    },
  ],
};

/** Copia o conteúdo válido substituindo as regras. */
function comRegras(regras: Regra[]): Conteudo {
  return { ...conteudoValido, regras: [...conteudoValido.regras, ...regras] };
}

/** Regra bem formada, base para os casos que introduzem um defeito por vez. */
function regraBase(): Regra {
  return {
    id: 'R-nova',
    condicao: {
      pares: [{ criterio: 'valorDeNegocio', valor: 'alto' }],
      descricao: 'A aplicação tem alto valor para o negócio',
    },
    estrategiaAlvo: 'retain',
    tipoDeEfeito: 'contribuicao',
    direcao: 'favor',
    textoMotivo: 'Motivo qualquer, não vazio.',
    estudosDeOrigem: ['[Kirkila2025]'],
    ehInterpretacao: true,
    evidenciaApenasDePorteGrande: false,
  };
}

const problemasDe = (conteudo: Conteudo) => verificarConsistencia(conteudo).map(descreverDivergencia);

describe('verificação de consistência do conteúdo', () => {
  it('não acusa divergência em conteúdo mínimo coerente', () => {
    expect(verificarConsistencia(conteudoValido)).toEqual([]);
    expect(exigirConteudoConsistente(conteudoValido)).toBe(conteudoValido);
  });

  it('acusa regra que aponta para estudo não cadastrado', () => {
    const problemas = problemasDe(
      comRegras([{ ...regraBase(), estudosDeOrigem: ['[NaoExiste2030]'], ehInterpretacao: false }]),
    );

    expect(problemas).toContain(
      'regra R-nova: aponta para o estudo [NaoExiste2030], que não está cadastrado',
    );
  });

  it('acusa regra que aponta para estratégia não cadastrada', () => {
    const problemas = problemasDe(comRegras([{ ...regraBase(), estrategiaAlvo: 'relocate' }]));

    expect(problemas).toContain(
      'regra R-nova: aponta para a estratégia relocate, que não está cadastrada',
    );
  });

  it('acusa condição com valor não cadastrado no critério', () => {
    const problemas = problemasDe(
      comRegras([
        {
          ...regraBase(),
          condicao: {
            pares: [{ criterio: 'valorDeNegocio', valor: 'medio' }],
            descricao: 'A aplicação tem valor médio para o negócio',
          },
        },
      ]),
    );

    expect(problemas).toContain(
      'regra R-nova: a condição usa o valor medio, que não está cadastrado no critério valorDeNegocio',
    );
  });

  it('acusa condição com critério não cadastrado', () => {
    const problemas = problemasDe(
      comRegras([
        {
          ...regraBase(),
          condicao: {
            pares: [{ criterio: 'hipervisor', valor: 'proprio' }],
            descricao: 'O hipervisor é próprio',
          },
        },
      ]),
    );

    expect(problemas).toContain(
      'regra R-nova: a condição usa o critério hipervisor, que não está cadastrado',
    );
  });

  it('acusa regra sem texto de motivo', () => {
    const problemas = problemasDe(comRegras([{ ...regraBase(), textoMotivo: '   ' }]));

    expect(problemas).toContain(
      'regra R-nova: não tem texto de motivo, exigido para justificar a posição da estratégia',
    );
  });

  it('acusa regra derivada de [Kirkila2025] sem a marcação de interpretação', () => {
    const problemas = problemasDe(comRegras([{ ...regraBase(), ehInterpretacao: false }]));

    expect(problemas).toContain(
      'regra R-nova: deriva de [Kirkila2025] e não carrega a marcação de interpretação',
    );
  });

  it('acusa regra sustentada apenas por [Dalakas2025] sem a marcação de porte', () => {
    const problemas = problemasDe(
      comRegras([
        {
          ...regraBase(),
          estudosDeOrigem: ['[Dalakas2025]'],
          ehInterpretacao: false,
          evidenciaApenasDePorteGrande: false,
        },
      ]),
    );

    expect(problemas).toContain(
      'regra R-nova: sustenta-se apenas em [Dalakas2025] e não carrega a marcação de porte',
    );
  });

  it('não exige marcação de porte quando um dos estudos não é só de porte grande', () => {
    const problemas = problemasDe(
      comRegras([
        {
          ...regraBase(),
          estudosDeOrigem: ['[Dalakas2025]', '[Kirkila2025]'],
          evidenciaApenasDePorteGrande: false,
        },
      ]),
    );

    expect(problemas).toEqual([]);
  });

  it('acusa pergunta que investiga critério não cadastrado', () => {
    const problemas = problemasDe({
      ...conteudoValido,
      perguntas: [{ ...conteudoValido.perguntas[0], criterio: 'inventado' }],
    });

    expect(problemas).toContain(
      'pergunta P2: investiga o critério inventado, que não está cadastrado',
    );
  });

  it('acusa pergunta cujo critério nenhuma regra usa', () => {
    const problemas = problemasDe({
      ...conteudoValido,
      regras: [conteudoValido.regras[0]],
    });

    expect(problemas).toContain(
      'pergunta P6: investiga o critério previsibilidadeDaCarga, que nenhuma regra usa, então a resposta não move estratégia',
    );
  });

  it('acusa estratégia não cadastrada em estratégias afetadas e em condição de exibição', () => {
    const problemas = problemasDe({
      ...conteudoValido,
      perguntas: [
        { ...conteudoValido.perguntas[0], estrategiasAfetadas: ['refactor'] },
        {
          ...conteudoValido.perguntas[1],
          condicaoDeExibicao: { estrategiasEmJogo: ['replatform'] },
        },
      ],
    });

    expect(problemas).toContain('pergunta P2: afeta a estratégia refactor, que não está cadastrada');
    expect(problemas).toContain(
      'pergunta P6: só aparece com a estratégia replatform em jogo, e ela não está cadastrada',
    );
  });

  it('acusa valor de resposta que declara outro critério e identificador repetido', () => {
    const problemas = problemasDe({
      ...conteudoValido,
      criterios: [
        {
          ...conteudoValido.criterios[0],
          valores: [
            { id: 'alto', criterio: 'outroCriterio', rotulo: 'Alto' },
            { id: 'alto', criterio: 'valorDeNegocio', rotulo: 'Alto de novo' },
            { id: 'baixo', criterio: 'valorDeNegocio', rotulo: 'Baixo' },
          ],
        },
        conteudoValido.criterios[1],
      ],
    });

    expect(problemas).toContain(
      'critério valorDeNegocio: o valor alto declara pertencer ao critério outroCriterio, não a este',
    );
    expect(problemas).toContain(
      'critério valorDeNegocio: o valor de resposta alto aparece mais de uma vez',
    );
  });

  it('reúne todas as divergências e as reporta com identificação do item', () => {
    const inconsistente = comRegras([
      {
        ...regraBase(),
        estrategiaAlvo: 'relocate',
        estudosDeOrigem: [],
        condicao: { pares: [], descricao: 'sempre' },
        textoMotivo: '',
        ehInterpretacao: false,
      },
    ]);

    const divergencias = verificarConsistencia(inconsistente);

    expect(divergencias.length).toBeGreaterThanOrEqual(4);
    expect(divergencias.every((divergencia) => divergencia.item === 'regra R-nova')).toBe(true);
    expect(() => exigirConteudoConsistente(inconsistente)).toThrow(ErroDeConsistenciaDeConteudo);

    try {
      exigirConteudoConsistente(inconsistente);
      expect.unreachable('a verificação deveria ter falhado');
    } catch (erro) {
      expect((erro as ErroDeConsistenciaDeConteudo).divergencias).toEqual(divergencias);
      expect((erro as Error).message).toContain('regra R-nova: não registra o estudo que a sustenta');
    }
  });
});
