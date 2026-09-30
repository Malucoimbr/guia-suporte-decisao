import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RESPOSTA_DESCONHECIDA, abrirSessao, registrarResposta } from '../sessao/sessao';
import type { ValorInformado } from '../sessao/sessao';
import type { Conteudo, Id, Sessao } from '../dominio/tipos';
import { VisaoESeDoCriterio } from './VisaoESeDoCriterio';

/**
 * Conteúdo de teste, montado à mão pelo mesmo motivo do teste da tela de
 * resultado: a apresentação precisa valer para qualquer catálogo, e o teste
 * precisa controlar as três situações que o Requisito 3.5 distingue — um valor
 * que muda faixa, um valor que não muda nada, e um critério cujo valor algum não
 * muda nada.
 *
 * A precondição regulatória e a verificação de plataforma condicionada a
 * Replatform em jogo estão aqui porque são o caso concreto de resposta que o
 * cenário hipotético derruba: assumir a restrição regulatória fixa Replatform, e
 * a verificação de banco deixa de ter sido perguntada.
 */
const CONTEUDO: Conteudo = {
  criterios: [
    {
      id: 'restricaoRegulatoria',
      nome: 'Requisitos regulatórios',
      descricao: 'Dado ou componente sob exigência regulatória.',
      permiteRespostaMultipla: false,
      valores: [
        { id: 'sim', criterio: 'restricaoRegulatoria', rotulo: 'Sim' },
        { id: 'nao', criterio: 'restricaoRegulatoria', rotulo: 'Não' },
      ],
    },
    {
      id: 'carga',
      nome: 'Previsibilidade da carga',
      descricao: 'Comportamento da carga ao longo do ano.',
      permiteRespostaMultipla: false,
      valores: [
        { id: 'estavel', criterio: 'carga', rotulo: 'Estável e previsível' },
        { id: 'variavel', criterio: 'carga', rotulo: 'Variável ou sazonal' },
      ],
    },
    {
      id: 'compatibilidadeDeBanco',
      nome: 'Compatibilidade de banco',
      descricao: 'Equivalente compatível na plataforma gerenciada pretendida.',
      permiteRespostaMultipla: false,
      valores: [
        { id: 'sim', criterio: 'compatibilidadeDeBanco', rotulo: 'Sim' },
        { id: 'nao', criterio: 'compatibilidadeDeBanco', rotulo: 'Não' },
      ],
    },
  ],
  perguntas: [
    {
      id: 'Pr',
      texto: 'Existe componente sob exigência regulatória?',
      criterio: 'restricaoRegulatoria',
      bloco: 'B',
      ordem: 1,
      estrategiasAfetadas: ['retain', 'replatform'],
      fontes: ['[Ramchand2021]'],
    },
    {
      id: 'Pc',
      texto: 'Como se comporta a carga ao longo do ano?',
      criterio: 'carga',
      bloco: 'B',
      ordem: 2,
      estrategiasAfetadas: ['retain'],
      fontes: ['[Dalakas2025]'],
    },
    {
      id: 'Pf',
      texto: 'O banco de dados tem equivalente compatível na plataforma?',
      criterio: 'compatibilidadeDeBanco',
      bloco: 'F',
      ordem: 1,
      condicaoDeExibicao: { estrategiasEmJogo: ['replatform'] },
      estrategiasAfetadas: ['replatform'],
      fontes: ['[Khouibiri2024]'],
    },
  ],
  estrategias: [
    {
      id: 'retain',
      nome: 'Retain',
      descricao: 'Manter a aplicação como está, no ambiente atual.',
      temCaracterizacaoNoCorpus: true,
    },
    {
      id: 'replatform',
      nome: 'Replatform',
      descricao: 'Adaptar a aplicação à plataforma alvo.',
      temCaracterizacaoNoCorpus: true,
    },
  ],
  regras: [
    {
      id: 'r-regulatoria-replatform',
      condicao: {
        pares: [{ criterio: 'restricaoRegulatoria', valor: 'sim' }],
        descricao: 'há componente sob exigência regulatória',
      },
      estrategiaAlvo: 'replatform',
      tipoDeEfeito: 'precondicao',
      direcao: 'contra',
      textoMotivo: 'Componente regulado impede executar fora do ambiente atual.',
      estudosDeOrigem: ['[Ramchand2021]'],
      ehInterpretacao: false,
      evidenciaApenasDePorteGrande: false,
    },
    {
      id: 'r-regulatoria-retain',
      condicao: {
        pares: [{ criterio: 'restricaoRegulatoria', valor: 'sim' }],
        descricao: 'há componente sob exigência regulatória',
      },
      estrategiaAlvo: 'retain',
      tipoDeEfeito: 'contribuicao',
      direcao: 'favor',
      textoMotivo: 'Componente regulado favorece manter a aplicação como está.',
      estudosDeOrigem: ['[Ramchand2021]'],
      ehInterpretacao: false,
      evidenciaApenasDePorteGrande: false,
    },
    {
      id: 'r-carga-retain',
      condicao: {
        pares: [{ criterio: 'carga', valor: 'estavel' }],
        descricao: 'a carga é estável e previsível',
      },
      estrategiaAlvo: 'retain',
      tipoDeEfeito: 'contribuicao',
      direcao: 'favor',
      textoMotivo: 'Sob carga estável, contrato e depreciação favorecem permanecer.',
      estudosDeOrigem: ['[Dalakas2025]'],
      ehInterpretacao: false,
      evidenciaApenasDePorteGrande: true,
    },
    {
      id: 'r-banco-replatform',
      condicao: {
        pares: [{ criterio: 'compatibilidadeDeBanco', valor: 'sim' }],
        descricao: 'o banco tem equivalente compatível na plataforma',
      },
      estrategiaAlvo: 'replatform',
      tipoDeEfeito: 'contribuicao',
      direcao: 'favor',
      textoMotivo: 'Banco compatível sustenta a adaptação à plataforma gerenciada.',
      estudosDeOrigem: ['[Khouibiri2024]'],
      ehInterpretacao: false,
      evidenciaApenasDePorteGrande: false,
    },
  ],
  estudos: [
    {
      id: '[Ramchand2021]',
      referencia: 'Ramchand; Chhetri; Kowalczyk (2021). Enterprise adoption of cloud computing.',
      arquivoNoAcervo: null,
      contextoEmpirico: 'Caso real com 350 aplicações.',
      porteAnalisado: 'Banco de porte médio.',
    },
    {
      id: '[Dalakas2025]',
      referencia: 'Dalakas et al. (2025). Are Public Cloud Solutions Really Cheaper?',
      arquivoNoAcervo: null,
      contextoEmpirico: 'Custo em cinco anos, três modelos.',
      porteAnalisado: 'Organização governamental de larga escala.',
    },
    {
      id: '[Khouibiri2024]',
      referencia: 'Khouibiri; Farhaoui; Taherdoost (2024). Exploring BI Data Transition to the Cloud.',
      arquivoNoAcervo: null,
      contextoEmpirico: 'Análise técnica de literatura.',
      porteAnalisado: 'Porte não especificado.',
    },
  ],
};

function sessaoCom(...respostas: readonly [Id, ValorInformado][]): Sessao {
  let sessao = abrirSessao({
    conteudo: CONTEUDO,
    id: 'sessao-de-teste',
    inicio: '2026-01-01T00:00:00.000Z',
  });
  for (const [criterio, valor] of respostas) {
    sessao = registrarResposta(sessao, criterio, valor, '2026-01-01T00:00:01.000Z').sessao;
  }
  return sessao;
}

/**
 * A regulação ficou sem resposta e a verificação de banco foi respondida: hoje
 * Replatform está recomendada, e assumir a regulação a derruba junto com a
 * resposta que só existia porque ela estava em jogo.
 */
const SESSAO_COM_REGULACAO_SEM_RESPOSTA = sessaoCom(
  ['restricaoRegulatoria', RESPOSTA_DESCONHECIDA],
  ['carga', 'variavel'],
  ['compatibilidadeDeBanco', 'sim'],
);

/**
 * A regulação foi respondida e fixou Replatform em não recomendada: nenhum valor
 * da verificação de banco muda mais nada.
 */
const SESSAO_COM_REPLATFORM_FIXADA = sessaoCom(
  ['restricaoRegulatoria', 'sim'],
  ['carga', 'variavel'],
  ['compatibilidadeDeBanco', RESPOSTA_DESCONHECIDA],
);

function visao(nome: RegExp) {
  return within(screen.getByRole('region', { name: nome }));
}

describe('VisaoESeDoCriterio', () => {
  it('apresenta um cenário por valor possível do critério (Requisito 3.5)', () => {
    render(
      <VisaoESeDoCriterio
        id="e-se-regulatoria"
        sessao={SESSAO_COM_REGULACAO_SEM_RESPOSTA}
        criterio="restricaoRegulatoria"
      />,
    );

    const secao = visao(/Se «Requisitos regulatórios» fosse respondido/i);
    expect(secao.getAllByRole('heading', { level: 5 })).toHaveLength(2);
    expect(secao.getByRole('heading', { level: 5, name: /^Sim —/i })).toBeInTheDocument();
    expect(secao.getByRole('heading', { level: 5, name: /^Não —/i })).toBeInTheDocument();
  });

  it('traz o foco ao seu título, porque a visão abre no meio da tela de resultado', () => {
    render(
      <VisaoESeDoCriterio
        id="e-se-regulatoria"
        sessao={SESSAO_COM_REGULACAO_SEM_RESPOSTA}
        criterio="restricaoRegulatoria"
      />,
    );

    expect(
      screen.getByRole('heading', { level: 4, name: /Se «Requisitos regulatórios» fosse respondido/i }),
    ).toHaveFocus();
  });

  it('mostra quais estratégias mudariam de faixa no valor que altera o resultado', () => {
    render(
      <VisaoESeDoCriterio
        id="e-se-regulatoria"
        sessao={SESSAO_COM_REGULACAO_SEM_RESPOSTA}
        criterio="restricaoRegulatoria"
      />,
    );

    const secao = visao(/Se «Requisitos regulatórios» fosse respondido/i);
    expect(secao.getByRole('heading', { level: 5, name: /Sim — as faixas mudariam/i })).toBeInTheDocument();
    expect(secao.getByText(/Retain: de «possível» para «recomendada»/i)).toBeInTheDocument();
    expect(
      secao.getByText(/Replatform: de «recomendada» para «não recomendada»/i),
    ).toBeInTheDocument();
    expect(secao.getByText(/Recomendadas neste cenário: Retain\./i)).toBeInTheDocument();
  });

  it('declara o cenário que não muda nada em lugar de omiti-lo', () => {
    render(
      <VisaoESeDoCriterio
        id="e-se-regulatoria"
        sessao={SESSAO_COM_REGULACAO_SEM_RESPOSTA}
        criterio="restricaoRegulatoria"
      />,
    );

    expect(
      visao(/Se «Requisitos regulatórios» fosse respondido/i).getByRole('heading', {
        level: 5,
        name: /Não — nada mudaria/i,
      }),
    ).toBeInTheDocument();
  });

  it('declara as respostas que a sessão perderia no cenário', () => {
    render(
      <VisaoESeDoCriterio
        id="e-se-regulatoria"
        sessao={SESSAO_COM_REGULACAO_SEM_RESPOSTA}
        criterio="restricaoRegulatoria"
      />,
    );

    expect(
      visao(/Se «Requisitos regulatórios» fosse respondido/i).getByText(
        /perderia uma resposta que só existia .*Compatibilidade de banco: Sim/i,
      ),
    ).toBeInTheDocument();
  });

  it('compara com o que está registrado, declarando as recomendadas de hoje', () => {
    render(
      <VisaoESeDoCriterio
        id="e-se-regulatoria"
        sessao={SESSAO_COM_REGULACAO_SEM_RESPOSTA}
        criterio="restricaoRegulatoria"
      />,
    );

    expect(
      visao(/Se «Requisitos regulatórios» fosse respondido/i).getByText(
        /Com o que está registrado, as estratégias recomendadas são: Replatform\./i,
      ),
    ).toBeInTheDocument();
  });

  it('declara que buscar a informação não muda o resultado quando nenhum valor altera nada', () => {
    render(
      <VisaoESeDoCriterio
        id="e-se-banco"
        sessao={SESSAO_COM_REPLATFORM_FIXADA}
        criterio="compatibilidadeDeBanco"
      />,
    );

    const secao = visao(/Se «Compatibilidade de banco» fosse respondido/i);
    expect(
      secao.getByText(/Nenhum valor possível deste critério altera as estratégias recomendadas/i),
    ).toBeInTheDocument();
    expect(secao.getAllByRole('heading', { level: 5, name: /nada mudaria/i })).toHaveLength(2);
  });
});
