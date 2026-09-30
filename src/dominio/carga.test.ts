import { describe, expect, it } from 'vitest';
import {
  ErroDeCargaDeConteudo,
  carregarConteudo,
  interpretarConteudo,
  type ConteudoBruto,
} from './carga';

/**
 * A carga tem duas responsabilidades verificáveis: devolver um objeto de
 * conteúdo tipado a partir dos JSON e recusar conteúdo malformado apontando
 * onde está o defeito. Os testes de forma usam conteúdo próprio, para não
 * depender do que já foi cadastrado em `src/conteudo/`; os dois últimos leem os
 * arquivos reais do repositório.
 */

const brutoValido: ConteudoBruto = {
  criterios: [
    {
      id: 'usoDaAplicacao',
      nome: 'Uso e destino da aplicação',
      descricao: 'Se a aplicação continuará em uso ou está prevista para desativação.',
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
      textoMotivo: 'Aplicação destinada a desativação favorece Retire.',
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

describe('interpretação do conteúdo', () => {
  it('devolve as coleções tipadas a partir do conteúdo bruto', () => {
    const conteudo = interpretarConteudo(brutoValido);

    expect(conteudo.criterios).toHaveLength(1);
    expect(conteudo.criterios[0].valores).toHaveLength(2);
    expect(conteudo.criterios[0].permiteRespostaMultipla).toBe(false);
    expect(conteudo.perguntas.map((pergunta) => pergunta.id)).toEqual(['P1', 'P16']);
    expect(conteudo.estrategias[0].temCaracterizacaoNoCorpus).toBe(true);
    expect(conteudo.regras[0].condicao.pares).toEqual([
      { criterio: 'usoDaAplicacao', valor: 'previstaParaDesativacao' },
    ]);
    expect(conteudo.estudos[0].id).toBe('[Ramchand2021]');
  });

  it('preserva a condição de exibição por estratégia em jogo e a ausência dela', () => {
    const conteudo = interpretarConteudo(brutoValido);
    const [p1, p16] = conteudo.perguntas;

    expect(p1.condicaoDeExibicao).toBeUndefined();
    expect(p16.condicaoDeExibicao?.estrategiasEmJogo).toEqual(['replatform']);
    expect(p16.condicaoDeExibicao?.respostas).toBeUndefined();
  });

  it('aceita arquivo ausente no acervo como nulo', () => {
    const conteudo = interpretarConteudo({
      ...brutoValido,
      estudos: [
        {
          id: '[Holler2025]',
          referencia: 'Holler; Westner (2025)',
          arquivoNoAcervo: null,
          contextoEmpirico: 'Ausente do acervo',
          porteAnalisado: 'Não declarado',
        },
      ],
    });

    expect(conteudo.estudos[0].arquivoNoAcervo).toBeNull();
  });

  it('recusa item sem campo obrigatório, apontando o caminho do defeito', () => {
    const semNome = {
      ...brutoValido,
      criterios: [{ id: 'usoDaAplicacao', descricao: 'sem nome', permiteRespostaMultipla: false }],
    };

    expect(() => interpretarConteudo(semNome)).toThrow(ErroDeCargaDeConteudo);

    try {
      interpretarConteudo(semNome);
      expect.unreachable('a carga deveria ter falhado');
    } catch (erro) {
      const problemas = (erro as ErroDeCargaDeConteudo).problemas;
      expect(problemas).toContain('criterios.json[0].nome deveria ser texto não vazio');
      expect(problemas).toContain('criterios.json[0].valores deveria ser uma lista');
    }
  });

  it('recusa valor fora do conjunto admitido em bloco, tipo de efeito e direção', () => {
    const foraDoConjunto = {
      ...brutoValido,
      perguntas: [{ ...(brutoValido.perguntas as object[])[0], bloco: 'Z' }],
      regras: [{ ...(brutoValido.regras as object[])[0], tipoDeEfeito: 'talvez', direcao: 'meio' }],
    };

    try {
      interpretarConteudo(foraDoConjunto);
      expect.unreachable('a carga deveria ter falhado');
    } catch (erro) {
      const problemas = (erro as ErroDeCargaDeConteudo).problemas;
      expect(problemas).toContain('perguntas.json[0].bloco deveria ser um de: A, B, C, D, E, F');
      expect(problemas).toContain(
        'regras.json[0].tipoDeEfeito deveria ser um de: precondicao, contribuicao',
      );
      expect(problemas).toContain('regras.json[0].direcao deveria ser um de: favor, contra');
    }
  });

  it('reúne todos os problemas em vez de parar no primeiro', () => {
    try {
      interpretarConteudo({
        criterios: 'não é lista',
        perguntas: [42],
        estrategias: [],
        regras: [],
        estudos: [],
      });
      expect.unreachable('a carga deveria ter falhado');
    } catch (erro) {
      const problemas = (erro as ErroDeCargaDeConteudo).problemas;
      expect(problemas).toContain('criterios.json deveria ser uma lista');
      expect(problemas).toContain('perguntas.json[0] deveria ser um objeto');
      expect(problemas.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('carga do conteúdo do repositório', () => {
  it('lê os arquivos de src/conteudo e devolve conteúdo tipado', () => {
    const conteudo = carregarConteudo();

    expect(Array.isArray(conteudo.criterios)).toBe(true);
    expect(Array.isArray(conteudo.perguntas)).toBe(true);
    expect(Array.isArray(conteudo.estrategias)).toBe(true);
    expect(Array.isArray(conteudo.regras)).toBe(true);
    expect(Array.isArray(conteudo.estudos)).toBe(true);
    expect(Array.isArray(conteudo.listasDeAviso)).toBe(true);
  });

  it('devolve estruturas próprias a cada carga, para isolar sessões', () => {
    const primeira = carregarConteudo();
    const segunda = carregarConteudo();

    expect(segunda).toEqual(primeira);
    expect(segunda).not.toBe(primeira);
    expect(segunda.estrategias).not.toBe(primeira.estrategias);

    primeira.criterios.push({
      id: 'inventado',
      nome: 'Critério inventado por uma sessão',
      descricao: 'Não existe no conteúdo cadastrado.',
      permiteRespostaMultipla: false,
      valores: [],
    });

    expect(carregarConteudo().criterios.some((item) => item.id === 'inventado')).toBe(false);
  });
});
