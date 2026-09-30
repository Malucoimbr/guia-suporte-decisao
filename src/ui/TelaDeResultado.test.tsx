import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RESPOSTA_DESCONHECIDA, abrirSessao, registrarResposta } from '../sessao/sessao';
import type { ValorInformado } from '../sessao/sessao';
import type { Conteudo, Id, Sessao } from '../dominio/tipos';
import { TelaDeResultado } from './TelaDeResultado';

/**
 * Conteúdo de teste, mínimo e suficiente para exercitar o que a tela precisa
 * apresentar: uma estratégia com regra a favor e marcação de porte, uma com
 * regras nas duas direções e marcação de interpretação, uma precondição que
 * elimina, e uma estratégia sem regra alguma — que é o grupo "não avaliada".
 *
 * Fixado à mão em lugar do conteúdo real de propósito: a tela é responsável por
 * apresentar o que o mecanismo devolve, e o teste precisa controlar as
 * marcações e as fontes sem depender do estado da Rapid Review.
 */
const CONTEUDO: Conteudo = {
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
  ],
  perguntas: [
    {
      id: 'Pv',
      texto: 'Qual o valor da aplicação para o negócio hoje?',
      criterio: 'valorDeNegocio',
      bloco: 'A',
      ordem: 1,
      estrategiasAfetadas: ['refactor'],
      fontes: ['[Kirkila2025]'],
    },
    {
      id: 'Pr',
      texto: 'Existe componente sob exigência regulatória?',
      criterio: 'restricaoRegulatoria',
      bloco: 'B',
      ordem: 1,
      estrategiasAfetadas: ['refactor'],
      fontes: ['[Ramchand2021]'],
    },
    {
      id: 'Pc',
      texto: 'Como se comporta a carga ao longo do ano?',
      criterio: 'carga',
      bloco: 'C',
      ordem: 1,
      estrategiasAfetadas: ['retain', 'refactor'],
      fontes: ['[Dalakas2025]'],
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
      id: 'refactor',
      nome: 'Refactor',
      descricao: 'Reescrever ou reestruturar a aplicação.',
      temCaracterizacaoNoCorpus: true,
    },
    {
      id: 'relocate',
      nome: 'Relocate',
      descricao: 'Mover o ambiente inteiro entre infraestruturas.',
      temCaracterizacaoNoCorpus: false,
    },
  ],
  regras: [
    {
      id: 'r-valor-refactor',
      condicao: {
        pares: [{ criterio: 'valorDeNegocio', valor: 'alto' }],
        descricao: 'a aplicação tem alto valor para o negócio',
      },
      estrategiaAlvo: 'refactor',
      tipoDeEfeito: 'contribuicao',
      direcao: 'favor',
      textoMotivo: 'Reengenharia se justifica em aplicação de alto valor.',
      estudosDeOrigem: ['[Kirkila2025]'],
      ehInterpretacao: true,
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
      textoMotivo:
        'Sob carga estável, contrato e depreciação favorecem permanecer no ambiente atual.',
      estudosDeOrigem: ['[Dalakas2025]'],
      ehInterpretacao: false,
      evidenciaApenasDePorteGrande: true,
    },
    {
      id: 'r-carga-refactor',
      condicao: {
        pares: [{ criterio: 'carga', valor: 'estavel' }],
        descricao: 'a carga é estável e previsível',
      },
      estrategiaAlvo: 'refactor',
      tipoDeEfeito: 'contribuicao',
      direcao: 'contra',
      textoMotivo: 'Carga estável não sustenta o esforço de uma reescrita.',
      estudosDeOrigem: ['[Dalakas2025]'],
      ehInterpretacao: false,
      evidenciaApenasDePorteGrande: true,
    },
    {
      id: 'r-regulatoria-refactor',
      condicao: {
        pares: [{ criterio: 'restricaoRegulatoria', valor: 'sim' }],
        descricao: 'há componente sob exigência regulatória',
      },
      estrategiaAlvo: 'refactor',
      tipoDeEfeito: 'precondicao',
      direcao: 'contra',
      textoMotivo:
        'Componente sob exigência regulatória impede executar fora do ambiente atual.',
      estudosDeOrigem: ['[Ramchand2021]'],
      ehInterpretacao: false,
      evidenciaApenasDePorteGrande: false,
    },
  ],
  // Uma lista por aviso que as tem, com um item por estratégia, para conferir
  // que o filtro do encerramento usa as recomendadas desta sessão.
  listasDeAviso: [
    {
      id: 'fatoresDeFracasso',
      aviso: 'semPlanoDeExecucao',
      titulo: 'Fatores de fracasso do processo, que o Guia não avalia',
      descricao: 'A associação entre fator e estratégia é leitura da pesquisadora.',
      itens: [
        {
          id: 'complexidadeSubestimada',
          texto: 'Complexidade da reescrita subestimada no planejamento.',
          estudosDeOrigem: ['[Kirkila2025]'],
          estrategias: ['refactor'],
        },
      ],
    },
    {
      id: 'condutoresDeCusto',
      aviso: 'semEstimativaDeCusto',
      titulo: 'Condutores de custo identificados na comparação de cinco anos',
      descricao: 'Quatro condutores separaram os custos dos três modelos comparados.',
      itens: [
        {
          id: 'politicaDeDepreciacao',
          texto: 'Política de depreciação do ativo próprio.',
          estudosDeOrigem: ['[Dalakas2025]'],
          estrategias: ['retain'],
        },
      ],
    },
  ],
  estudos: [
    {
      id: '[Kirkila2025]',
      referencia:
        'Kirkila et al. (2025). Case Study Review: IT Legacy System Migration Success Factors.',
      arquivoNoAcervo: null,
      contextoEmpirico: 'Revisão narrativa e estudos de caso multissetoriais.',
      porteAnalisado: 'Porte não especificado.',
    },
    {
      id: '[Dalakas2025]',
      referencia: 'Dalakas et al. (2025). Are Public Cloud Solutions Really Cheaper?',
      arquivoNoAcervo: null,
      contextoEmpirico: 'Custo em cinco anos, três modelos.',
      porteAnalisado: 'Organização governamental de larga escala.',
    },
    {
      id: '[Ramchand2021]',
      referencia: 'Ramchand; Chhetri; Kowalczyk (2021). Enterprise adoption of cloud computing.',
      arquivoNoAcervo: null,
      contextoEmpirico: 'Caso real com 350 aplicações.',
      porteAnalisado: 'Banco de porte médio.',
    },
  ],
};

/** Sessão sobre o conteúdo de teste, com as respostas informadas registradas. */
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

/** Sessão completa: nada ficou sem resposta e nada foi descartado. */
const SESSAO_COMPLETA = sessaoCom(
  ['valorDeNegocio', 'alto'],
  ['restricaoRegulatoria', 'nao'],
  ['carga', 'estavel'],
);

/** Sessão em que a precondição regulatória descartou Refactor. */
const SESSAO_COM_DESCARTE = sessaoCom(
  ['valorDeNegocio', 'alto'],
  ['restricaoRegulatoria', 'sim'],
);

/** Sessão em que nada foi respondido: todas as respostas são "não sei". */
const SESSAO_SEM_INFORMACAO = sessaoCom(
  ['valorDeNegocio', RESPOSTA_DESCONHECIDA],
  ['restricaoRegulatoria', RESPOSTA_DESCONHECIDA],
  ['carga', RESPOSTA_DESCONHECIDA],
);

function faixa(nome: RegExp) {
  return within(screen.getByRole('region', { name: nome }));
}

describe('TelaDeResultado', () => {
  it('apresenta as três faixas, em títulos de nível 3 (Requisito 2.1)', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    expect(
      screen.getByRole('heading', { level: 3, name: /Estratégias recomendadas/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: /Estratégias possíveis/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: /Estratégias não recomendadas/i }),
    ).toBeInTheDocument();
  });

  it('traz o foco ao título do resultado, porque a pergunta saiu de cena', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    expect(screen.getByRole('heading', { level: 2, name: /Resultado da avaliação/i })).toHaveFocus();
  });

  it('apresenta a recomendada com a condição satisfeita, as respostas que a satisfizeram, o motivo e a referência do estudo (Requisitos 2.2 e 2.3)', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    const recomendadas = faixa(/Estratégias recomendadas/i);
    expect(
      recomendadas.getByRole('heading', { level: 4, name: /Retain — recomendada/i }),
    ).toBeInTheDocument();
    expect(
      recomendadas.getByText(/contrato e depreciação favorecem permanecer/i),
    ).toBeInTheDocument();
    expect(
      recomendadas.getByText(/Condição satisfeita: a carga é estável e previsível/i),
    ).toBeInTheDocument();
    expect(
      recomendadas.getByText(/Suas respostas: Previsibilidade da carga: Estável e previsível/i),
    ).toBeInTheDocument();
    expect(
      recomendadas.getByText(/Fonte: \[Dalakas2025\] — Dalakas et al\. \(2025\)/i),
    ).toBeInTheDocument();
  });

  it('marca a estratégia cuja evidência vem só de organizações de porte grande (Requisito 4.5)', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    expect(
      faixa(/Estratégias recomendadas/i).getByText(/Marcação de porte/i),
    ).toBeInTheDocument();
  });

  it('marca a estratégia que se apoia em interpretação da pesquisadora (Requisito 2.5)', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    const possiveis = faixa(/Estratégias possíveis/i);
    expect(
      possiveis.getByRole('heading', { level: 4, name: /Refactor — possível/i }),
    ).toBeInTheDocument();
    expect(possiveis.getByText(/Marcação de interpretação/i)).toBeInTheDocument();
  });

  it('distingue "evidência dividida" de "nenhuma regra se aplicou" (Seção 5.3 do design)', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    const possiveis = faixa(/Estratégias possíveis/i);
    expect(possiveis.getByText(/Evidência dividida/i)).toBeInTheDocument();
    expect(possiveis.queryByText(/Nenhuma regra se aplicou/i)).not.toBeInTheDocument();
    // As duas listas ficam visíveis: o conflito não é resolvido.
    expect(possiveis.getByRole('heading', { level: 5, name: /A favor/i })).toBeInTheDocument();
    expect(possiveis.getByRole('heading', { level: 5, name: /^Contra$/i })).toBeInTheDocument();
  });

  it('declara "nenhuma regra se aplicou" quando o cenário não acionou regra alguma', () => {
    render(<TelaDeResultado sessao={SESSAO_SEM_INFORMACAO} />);

    const possiveis = faixa(/Estratégias possíveis/i);
    expect(possiveis.getAllByText(/Nenhuma regra se aplicou/i)).toHaveLength(2);
    expect(possiveis.queryByText(/Evidência dividida/i)).not.toBeInTheDocument();
  });

  it('apresenta a não recomendada com o motivo do descarte por precondição falhada (Requisito 2.4)', () => {
    render(<TelaDeResultado sessao={SESSAO_COM_DESCARTE} />);

    const naoRecomendadas = faixa(/Estratégias não recomendadas/i);
    expect(
      naoRecomendadas.getByRole('heading', { level: 4, name: /Refactor — não recomendada/i }),
    ).toBeInTheDocument();
    expect(
      naoRecomendadas.getByRole('heading', {
        level: 5,
        name: /Verificação obrigatória que falhou/i,
      }),
    ).toBeInTheDocument();
    expect(
      naoRecomendadas.getByText(/impede executar fora do ambiente atual/i),
    ).toBeInTheDocument();
    expect(
      naoRecomendadas.getByText(/Fonte: \[Ramchand2021\] — Ramchand/i),
    ).toBeInTheDocument();
  });

  it('apresenta o grupo das não avaliadas com a razão (Seção 5.4 do design)', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    const naoAvaliadas = faixa(/Estratégias não avaliadas pelo Guia/i);
    expect(
      naoAvaliadas.getByRole('heading', { level: 4, name: /Relocate — não avaliada/i }),
    ).toBeInTheDocument();
    expect(
      naoAvaliadas.getByText(/não fornece regra que permita recomendá-la ou descartá-la/i),
    ).toBeInTheDocument();
  });

  it('declara que a sessão não distinguiu alternativas quando nada foi descartado (Requisito 2.6)', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    expect(screen.getByText(/não distinguiu alternativas/i)).toBeInTheDocument();
    expect(faixa(/Estratégias não recomendadas/i).getByText(/Nenhuma estratégia foi descartada/i))
      .toBeInTheDocument();
  });

  it('não declara ausência de distinção quando alguma estratégia foi descartada (Requisito 2.6)', () => {
    render(<TelaDeResultado sessao={SESSAO_COM_DESCARTE} />);

    expect(screen.queryByText(/não distinguiu alternativas/i)).not.toBeInTheDocument();
  });

  it('declara o resultado parcial com a lista dos critérios respondidos como "não sei" (Requisito 3.4)', () => {
    render(<TelaDeResultado sessao={SESSAO_SEM_INFORMACAO} />);

    const parcial = within(screen.getByRole('region', { name: /Este resultado é parcial/i }));
    expect(
      parcial.getByText(/Valor de negócio — respondido como «não sei»/i),
    ).toBeInTheDocument();
    expect(
      parcial.getByText(/Requisitos regulatórios — respondido como «não sei»/i),
    ).toBeInTheDocument();
    expect(
      parcial.getByText(/Previsibilidade da carga — respondido como «não sei»/i),
    ).toBeInTheDocument();
  });

  it('declara parcial e aponta a pergunta que não foi apresentada quando a coleta parou antes do fim (Requisito 3.4)', () => {
    render(<TelaDeResultado sessao={SESSAO_COM_DESCARTE} />);

    const parcial = within(screen.getByRole('region', { name: /Este resultado é parcial/i }));
    expect(parcial.getByText(/encerrada antes de esgotar as perguntas/i)).toBeInTheDocument();
    expect(
      parcial.getByText(/Previsibilidade da carga — a pergunta não foi apresentada/i),
    ).toBeInTheDocument();
  });

  it('oferece a visão «e se» de cada critério sem resposta, e só sob demanda (Requisito 3.5)', () => {
    render(<TelaDeResultado sessao={SESSAO_SEM_INFORMACAO} />);

    const parcial = within(screen.getByRole('region', { name: /Este resultado é parcial/i }));
    const controle = parcial.getByRole('button', {
      name: /Ver o que mudaria sabendo «Valor de negócio»/i,
    });
    expect(parcial.getAllByRole('button', { name: /Ver o que mudaria sabendo/i })).toHaveLength(3);
    expect(controle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('region', { name: /Se «Valor de negócio» fosse respondido/i }),
    ).not.toBeInTheDocument();
  });

  it('apresenta um cenário por valor possível do critério pedido, com o foco na visão (Requisito 3.5)', () => {
    render(<TelaDeResultado sessao={SESSAO_SEM_INFORMACAO} />);

    fireEvent.click(
      screen.getByRole('button', { name: /Ver o que mudaria sabendo «Valor de negócio»/i }),
    );

    const visao = within(
      screen.getByRole('region', { name: /Se «Valor de negócio» fosse respondido/i }),
    );
    expect(visao.getByRole('heading', { level: 5, name: /Alto — as faixas mudariam/i })).toBeInTheDocument();
    expect(visao.getByText(/Refactor: de «possível» para «recomendada»/i)).toBeInTheDocument();
    expect(visao.getByRole('heading', { level: 5, name: /Baixo — nada mudaria/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 4, name: /Se «Valor de negócio» fosse respondido/i }),
    ).toHaveFocus();
    expect(
      screen.getByRole('button', { name: /Ocultar o que mudaria sabendo «Valor de negócio»/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('oferece a visão também para o critério cuja pergunta não foi apresentada (Requisito 3.5)', () => {
    render(<TelaDeResultado sessao={SESSAO_COM_DESCARTE} />);

    fireEvent.click(
      screen.getByRole('button', { name: /Ver o que mudaria sabendo «Previsibilidade da carga»/i }),
    );

    const visao = within(
      screen.getByRole('region', { name: /Se «Previsibilidade da carga» fosse respondido/i }),
    );
    // Refactor já saiu por precondição regulatória: nenhum valor da carga o
    // traz de volta, e Retain ganha a faixa no valor estável.
    expect(visao.getByText(/Retain: de «possível» para «recomendada»/i)).toBeInTheDocument();
    expect(
      visao.getByRole('heading', { level: 5, name: /Variável ou sazonal — nada mudaria/i }),
    ).toBeInTheDocument();
  });

  it('fecha a visão no segundo acionamento e devolve o foco ao controle', () => {
    render(<TelaDeResultado sessao={SESSAO_SEM_INFORMACAO} />);

    fireEvent.click(
      screen.getByRole('button', { name: /Ver o que mudaria sabendo «Valor de negócio»/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Ocultar o que mudaria sabendo «Valor de negócio»/i }),
    );

    expect(
      screen.queryByRole('region', { name: /Se «Valor de negócio» fosse respondido/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Ver o que mudaria sabendo «Valor de negócio»/i }),
    ).toHaveFocus();
  });

  it('mantém uma visão por vez: pedir outra fecha a anterior', () => {
    render(<TelaDeResultado sessao={SESSAO_SEM_INFORMACAO} />);

    fireEvent.click(
      screen.getByRole('button', { name: /Ver o que mudaria sabendo «Valor de negócio»/i }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Ver o que mudaria sabendo «Previsibilidade da carga»/i }),
    );

    expect(
      screen.queryByRole('region', { name: /Se «Valor de negócio» fosse respondido/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Se «Previsibilidade da carga» fosse respondido/i }),
    ).toBeInTheDocument();
  });

  it('não oferece a visão «e se» quando nenhum critério ficou sem resposta', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    expect(
      screen.queryByRole('button', { name: /Ver o que mudaria sabendo/i }),
    ).not.toBeInTheDocument();
  });

  it('não declara resultado parcial quando tudo foi respondido', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    expect(
      screen.queryByRole('region', { name: /Este resultado é parcial/i }),
    ).not.toBeInTheDocument();
  });

  it('oferece voltar às perguntas pendentes só quando alguma ficou na fila', () => {
    const voltar = vi.fn();
    const { unmount } = render(
      <TelaDeResultado sessao={SESSAO_COM_DESCARTE} onVoltarAsPerguntas={voltar} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Voltar às perguntas pendentes/i }));
    expect(voltar).toHaveBeenCalledOnce();

    unmount();
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} onVoltarAsPerguntas={voltar} />);
    expect(
      screen.queryByRole('button', { name: /Voltar às perguntas pendentes/i }),
    ).not.toBeInTheDocument();
  });

  it('lista as respostas registradas e pede a alteração da escolhida (Requisito 1.5)', () => {
    const revisar = vi.fn();
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} onRevisar={revisar} />);

    const respostas = within(screen.getByRole('region', { name: /Respostas registradas/i }));
    expect(respostas.getByText(/Previsibilidade da carga: Estável e previsível/i)).toBeInTheDocument();

    fireEvent.click(
      respostas.getByRole('button', { name: /Alterar a resposta sobre Previsibilidade da carga/i }),
    );
    expect(revisar).toHaveBeenCalledWith('carga');
  });

  it('não oferece alteração quando a tela é apresentada sem o recurso de revisão', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    expect(screen.queryByRole('button', { name: /Alterar a resposta/i })).not.toBeInTheDocument();
  });

  it('fecha com os três avisos de encerramento (Requisitos 4.2 a 4.4)', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    const avisos = within(screen.getByRole('region', { name: /Limites deste resultado/i }));
    expect(avisos.getAllByRole('heading', { level: 4 })).toHaveLength(3);
    expect(avisos.getByText(/não substituem avaliação especializada/i)).toBeInTheDocument();
    expect(avisos.getByText(/não avalia nada do que determina o resultado/i)).toBeInTheDocument();
    expect(avisos.getByText(/Estimar custo exigiria inventário automatizado/i)).toBeInTheDocument();
  });

  it('filtra as listas dos avisos pelas estratégias recomendadas na sessão (Seção 5.6 do design)', () => {
    render(<TelaDeResultado sessao={SESSAO_COMPLETA} />);

    // Nesta sessão só Retain é recomendada; Refactor ficou em "possível".
    const avisos = within(screen.getByRole('region', { name: /Limites deste resultado/i }));
    expect(avisos.getByText(/Política de depreciação do ativo próprio/i)).toBeInTheDocument();
    expect(avisos.queryByText(/Complexidade da reescrita subestimada/i)).not.toBeInTheDocument();
  });
});
