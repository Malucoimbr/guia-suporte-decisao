import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Conteudo, ItemDeAviso } from '../dominio/tipos';
import { AvisosDeEncerramento, filtrarItensPorEstrategias } from './AvisosDeEncerramento';

/**
 * Conteúdo de teste com uma lista para cada aviso que as tem, e itens dos dois
 * tipos: o que não depende da estratégia escolhida e o que depende. É o que
 * permite verificar o filtro da Seção 5.6 do design sem depender do estado do
 * conteúdo cadastrado, que a Rapid Review ainda vai mexer.
 */
const CONTEUDO: Conteudo = {
  criterios: [],
  perguntas: [],
  estrategias: [
    {
      id: 'retain',
      nome: 'Retain',
      descricao: 'Manter a aplicação como está.',
      temCaracterizacaoNoCorpus: true,
    },
    {
      id: 'replatform',
      nome: 'Replatform',
      descricao: 'Adaptar a aplicação à plataforma alvo.',
      temCaracterizacaoNoCorpus: true,
    },
  ],
  regras: [],
  estudos: [
    {
      id: '[Kirkila2025]',
      referencia: 'Kirkila et al. (2025). Case Study Review: IT Legacy System Migration.',
      arquivoNoAcervo: null,
      contextoEmpirico: 'Revisão narrativa e estudos de caso.',
      porteAnalisado: 'Porte não especificado.',
    },
    {
      id: '[Ramchand2021]',
      referencia: 'Ramchand; Chhetri; Kowalczyk (2021). Enterprise adoption of cloud computing.',
      arquivoNoAcervo: null,
      contextoEmpirico: 'Caso real com 350 aplicações.',
      porteAnalisado: 'Banco de porte médio.',
    },
  ],
  listasDeAviso: [
    {
      id: 'fatoresDeFracasso',
      aviso: 'semPlanoDeExecucao',
      titulo: 'Fatores de fracasso do processo, que o Guia não avalia',
      descricao: 'A associação entre fator e estratégia é leitura da pesquisadora.',
      itens: [
        {
          id: 'planejamentoDeficiente',
          texto: 'Planejamento deficiente do processo.',
          estudosDeOrigem: ['[Kirkila2025]'],
          estrategias: [],
        },
        {
          id: 'incompatibilidadeDePlataforma',
          texto: 'Incompatibilidade entre a aplicação e a plataforma alvo.',
          estudosDeOrigem: ['[Kirkila2025]'],
          estrategias: ['replatform'],
        },
      ],
    },
    {
      id: 'custosOcultos',
      aviso: 'semEstimativaDeCusto',
      titulo: 'Custos ocultos que as calculadoras de provedor não trazem',
      descricao: 'Ausentes das calculadoras dos provedores no caso avaliado.',
      itens: [
        {
          id: 'conectividadeARedePrivada',
          texto: 'Conectividade a rede privada entre o ambiente atual e o novo.',
          estudosDeOrigem: ['[Ramchand2021]'],
          estrategias: ['replatform'],
        },
      ],
    },
  ],
};

/** Conteúdo sem lista cadastrada: as declarações não dependem do conteúdo. */
const CONTEUDO_SEM_LISTAS: Conteudo = { ...CONTEUDO, listasDeAviso: [] };

function secao() {
  return within(screen.getByRole('region', { name: /Limites deste resultado/i }));
}

describe('AvisosDeEncerramento', () => {
  it('declara que a saída é apoio à decisão e não substitui avaliação especializada (Requisito 4.2)', () => {
    render(<AvisosDeEncerramento conteudo={CONTEUDO} recomendadas={['retain']} />);

    expect(
      secao().getByRole('heading', { level: 4, name: /apoio à decisão, não a decisão/i }),
    ).toBeInTheDocument();
    expect(secao().getByText(/não substituem avaliação especializada/i)).toBeInTheDocument();
  });

  it('declara que a saída não é plano de execução e traz os fatores do processo com a fonte (Requisito 4.3)', () => {
    render(<AvisosDeEncerramento conteudo={CONTEUDO} recomendadas={['replatform']} />);

    expect(
      secao().getByRole('heading', { level: 4, name: /não é plano de execução/i }),
    ).toBeInTheDocument();
    expect(
      secao().getByRole('heading', { level: 5, name: /Fatores de fracasso do processo/i }),
    ).toBeInTheDocument();
    expect(secao().getByText(/Planejamento deficiente do processo/i)).toBeInTheDocument();
    expect(secao().getAllByText(/\[Kirkila2025\] — Kirkila et al\. \(2025\)/i).length).toBeGreaterThan(0);
  });

  it('declara que a saída não contém estimativa de custo monetário e traz os custos associados (Requisito 4.4)', () => {
    render(<AvisosDeEncerramento conteudo={CONTEUDO} recomendadas={['replatform']} />);

    expect(
      secao().getByRole('heading', { level: 4, name: /não contém estimativa de custo monetário/i }),
    ).toBeInTheDocument();
    expect(
      secao().getByRole('heading', { level: 5, name: /Custos ocultos/i }),
    ).toBeInTheDocument();
    expect(secao().getByText(/Conectividade a rede privada/i)).toBeInTheDocument();
    expect(secao().getByText(/\[Ramchand2021\] — Ramchand/i)).toBeInTheDocument();
  });

  it('filtra os itens pelas estratégias recomendadas na sessão (Seção 5.6 do design)', () => {
    render(<AvisosDeEncerramento conteudo={CONTEUDO} recomendadas={['retain']} />);

    // Retain não move a aplicação: incompatibilidade de plataforma e
    // conectividade a rede privada não dizem respeito a este caminho.
    expect(secao().queryByText(/Incompatibilidade entre a aplicação/i)).not.toBeInTheDocument();
    expect(secao().queryByText(/Conectividade a rede privada/i)).not.toBeInTheDocument();
    // O que não depende da estratégia continua.
    expect(secao().getByText(/Planejamento deficiente do processo/i)).toBeInTheDocument();
  });

  it('declara a régua do recorte e as estratégias que o definiram', () => {
    render(<AvisosDeEncerramento conteudo={CONTEUDO} recomendadas={['replatform']} />);

    expect(
      secao().getAllByText(/se aplicam ao que foi recomendado nesta sessão: Replatform/i).length,
    ).toBeGreaterThan(0);
    expect(secao().getByText(/Incompatibilidade entre a aplicação/i)).toBeInTheDocument();
  });

  it('declara o recorte quando nenhuma estratégia foi recomendada', () => {
    render(<AvisosDeEncerramento conteudo={CONTEUDO} recomendadas={[]} />);

    expect(
      secao().getAllByText(/Nenhuma estratégia foi recomendada nesta sessão/i).length,
    ).toBeGreaterThan(0);
    expect(secao().getByText(/Planejamento deficiente do processo/i)).toBeInTheDocument();
    // A lista cujos itens todos dependem de estratégia fica declarada vazia, em
    // lugar de desaparecer sem explicação.
    expect(
      secao().getByText(/Nenhum item desta lista se aplica às estratégias recomendadas/i),
    ).toBeInTheDocument();
  });

  it('apresenta as três declarações mesmo quando nenhuma lista está cadastrada', () => {
    render(<AvisosDeEncerramento conteudo={CONTEUDO_SEM_LISTAS} recomendadas={['retain']} />);

    expect(secao().getAllByRole('heading', { level: 4 })).toHaveLength(3);
    expect(secao().queryByRole('heading', { level: 5 })).not.toBeInTheDocument();
  });
});

describe('filtrarItensPorEstrategias', () => {
  const item = (id: string, estrategias: string[]): ItemDeAviso => ({
    id,
    texto: `texto de ${id}`,
    estudosDeOrigem: ['[Kirkila2025]'],
    estrategias,
  });

  it('mantém o item sem estratégia associada, que vale para qualquer caminho', () => {
    expect(filtrarItensPorEstrategias([item('a', [])], []).map((i) => i.id)).toEqual(['a']);
  });

  it('mantém o item quando ao menos uma das suas estratégias foi recomendada', () => {
    const itens = [item('a', ['retain']), item('b', ['refactor', 'replatform'])];

    expect(filtrarItensPorEstrategias(itens, ['replatform']).map((i) => i.id)).toEqual(['b']);
  });
});
