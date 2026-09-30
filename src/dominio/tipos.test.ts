import { describe, expect, it } from 'vitest';
import type {
  Conteudo,
  PosicaoDeEstrategia,
  Resposta,
  Sessao,
  ValorRegistrado,
} from './tipos';

/**
 * Os tipos não têm comportamento em tempo de execução: o que estes testes
 * verificam é que o modelo da Seção 6 do design consegue representar os casos
 * que o Guia precisa — critério com resposta múltipla, "não sei" fora do
 * conteúdo cadastrado, precondição falhada e marcações de rastreabilidade.
 * A checagem de tipo em si é feita por `npm run typecheck`.
 */

const conteudo: Conteudo = {
  criterios: [
    {
      id: 'usoDaAplicacao',
      nome: 'Uso e destino da aplicação',
      descricao: 'Se a aplicação continuará em uso ou já está prevista para desativação.',
      permiteRespostaMultipla: false,
      valores: [
        { id: 'continuaEmUso', criterio: 'usoDaAplicacao', rotulo: 'Continua em uso' },
        {
          id: 'previstaParaDesativacao',
          criterio: 'usoDaAplicacao',
          rotulo: 'Prevista para desativação',
        },
      ],
    },
    {
      id: 'restricoesDaAplicacao',
      nome: 'Acoplamento e restrições da aplicação',
      descricao: 'Dependências que restringem a migração. Admite mais de um valor.',
      permiteRespostaMultipla: true,
      valores: [
        {
          id: 'bibliotecasDeTerceiros',
          criterio: 'restricoesDaAplicacao',
          rotulo: 'Bibliotecas de terceiros',
        },
        {
          id: 'versoesDescontinuadas',
          criterio: 'restricoesDaAplicacao',
          rotulo: 'Versões descontinuadas',
        },
      ],
    },
  ],
  perguntas: [
    {
      id: 'P1',
      texto: 'A aplicação continuará em uso ou já está prevista para desativação?',
      criterio: 'usoDaAplicacao',
      bloco: 'A',
      ordem: 1,
      estrategiasAfetadas: ['retire'],
      fontes: ['[Ramchand2021]'],
    },
    {
      id: 'P16',
      texto: 'O banco de dados tem equivalente compatível nessa plataforma?',
      criterio: 'compatibilidadeDeBanco',
      bloco: 'F',
      ordem: 2,
      condicaoDeExibicao: { estrategiasEmJogo: ['replatform'] },
      estrategiasAfetadas: ['replatform'],
      fontes: ['[Khouibiri2024]'],
    },
  ],
  estrategias: [
    {
      id: 'retire',
      nome: 'Retire',
      descricao: 'Desativar a aplicação.',
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
      id: 'R1',
      condicao: {
        pares: [{ criterio: 'usoDaAplicacao', valor: 'previstaParaDesativacao' }],
        descricao: 'A aplicação está prevista para desativação',
      },
      estrategiaAlvo: 'retire',
      tipoDeEfeito: 'contribuicao',
      direcao: 'favor',
      textoMotivo: 'Aplicação destinada a desativação é excluída da avaliação de migração.',
      estudosDeOrigem: ['[Ramchand2021]'],
      ehInterpretacao: false,
      evidenciaApenasDePorteGrande: false,
    },
  ],
  estudos: [
    {
      id: '[Ramchand2021]',
      referencia: 'Ramchand; Chhetri; Kowalczyk (2021)',
      arquivoNoAcervo: 'springer/Enterprise adoption of cloud computing...pdf',
      contextoEmpirico: 'Caso real, 350 aplicações',
      porteAnalisado: 'Banco de porte médio',
    },
  ],
};

describe('modelo de dados conceitual', () => {
  it('mantém "não sei" fora dos valores cadastrados de todo critério', () => {
    const rotulos = conteudo.criterios.flatMap((criterio) =>
      criterio.valores.map((valor) => valor.rotulo.toLowerCase()),
    );

    expect(rotulos).not.toContain('não sei');
  });

  it('representa "não sei" como valor implícito de resposta', () => {
    const desconhecida: ValorRegistrado = { tipo: 'desconhecida' };
    const resposta: Resposta = {
      criterio: 'usoDaAplicacao',
      valor: desconhecida,
      momento: '2026-01-01T10:00:00.000Z',
    };
    const sessao: Sessao = {
      id: 's1',
      inicio: '2026-01-01T10:00:00.000Z',
      conteudo,
      respostas: [resposta],
      criteriosSemResposta: ['usoDaAplicacao'],
    };

    expect(sessao.respostas[0].valor.tipo).toBe('desconhecida');
    expect(sessao.criteriosSemResposta).toEqual(['usoDaAplicacao']);
  });

  it('admite mais de um valor quando o critério permite resposta múltipla', () => {
    const criterio = conteudo.criterios.find((item) => item.id === 'restricoesDaAplicacao');
    const resposta: Resposta = {
      criterio: 'restricoesDaAplicacao',
      valor: { tipo: 'valores', valores: ['bibliotecasDeTerceiros', 'versoesDescontinuadas'] },
      momento: '2026-01-01T10:01:00.000Z',
    };

    expect(criterio?.permiteRespostaMultipla).toBe(true);
    expect(resposta.valor).toEqual({
      tipo: 'valores',
      valores: ['bibliotecasDeTerceiros', 'versoesDescontinuadas'],
    });
  });

  it('distingue precondição de contribuição e carrega as marcações na regra', () => {
    const precondicao: Conteudo['regras'][number] = {
      id: 'R2',
      condicao: {
        pares: [{ criterio: 'compatibilidadeDeBanco', valor: 'nao' }],
        descricao: 'O banco de dados não tem equivalente compatível na plataforma',
      },
      estrategiaAlvo: 'replatform',
      tipoDeEfeito: 'precondicao',
      direcao: 'contra',
      textoMotivo: 'A verificação de compatibilidade de banco exigida para PaaS falhou.',
      estudosDeOrigem: ['[Khouibiri2024]'],
      ehInterpretacao: false,
      evidenciaApenasDePorteGrande: false,
    };

    expect(conteudo.regras[0].tipoDeEfeito).toBe('contribuicao');
    expect(precondicao.tipoDeEfeito).toBe('precondicao');
    expect(precondicao.estudosDeOrigem).toHaveLength(1);
  });

  it('representa a posição da estratégia com faixa, rastro e marcações', () => {
    const posicao: PosicaoDeEstrategia = {
      estrategia: 'retire',
      faixa: 'recomendada',
      saldo: 1,
      regrasAFavor: [
        {
          regra: 'R1',
          condicaoSatisfeita: conteudo.regras[0].condicao,
          respostasQueSatisfizeram: [
            {
              criterio: 'usoDaAplicacao',
              valor: { tipo: 'valores', valores: ['previstaParaDesativacao'] },
              momento: '2026-01-01T10:00:00.000Z',
            },
          ],
          textoMotivo: conteudo.regras[0].textoMotivo,
          estudosDeOrigem: conteudo.regras[0].estudosDeOrigem,
        },
      ],
      regrasContra: [],
      precondicoesFalhadas: [],
      evidenciaDividida: false,
      nenhumaRegraAplicada: false,
      temMarcacaoDeInterpretacao: false,
      temMarcacaoDePorte: false,
    };

    expect(posicao.faixa).toBe('recomendada');
    expect(posicao.regrasAFavor[0].estudosDeOrigem).toEqual(['[Ramchand2021]']);
  });
});
