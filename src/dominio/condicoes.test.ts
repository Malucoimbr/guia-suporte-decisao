import { describe, expect, it } from 'vitest';
import {
  avaliarCondicao,
  condicaoIndeterminada,
  condicaoSatisfeita,
  indexarRespostasPorCriterio,
} from './condicoes';
import type { Condicao, Id, Resposta } from './tipos';

/**
 * Os testes montam critérios, condições e respostas no próprio arquivo, e não
 * leem `src/conteudo/`: a avaliação precisa valer para qualquer conteúdo, e o
 * conteúdo do repositório ainda está sendo cadastrado. Os cenários da Seção 8.1
 * do design, sobre o conteúdo real, são tarefa à parte (4.4).
 */

/** Resposta com um ou mais valores escolhidos. */
function respondeu(criterio: Id, ...valores: Id[]): Resposta {
  return {
    criterio,
    valor: { tipo: 'valores', valores },
    momento: '2026-01-01T10:00:00.000Z',
  };
}

/** Resposta "não sei" (Requisito 3.1). */
function naoSabe(criterio: Id): Resposta {
  return {
    criterio,
    valor: { tipo: 'desconhecida' },
    momento: '2026-01-01T10:00:00.000Z',
  };
}

/** Condição composta do quadrante de [Kirkila2025]: valor alto e saúde ruim. */
const valorAltoEQualidadeRuim: Condicao = {
  pares: [
    { criterio: 'valorDeNegocio', valor: 'alto' },
    { criterio: 'qualidadeTecnica', valor: 'ruim' },
  ],
  descricao: 'A aplicação tem alto valor para o negócio e saúde técnica ruim',
};

/** Condição de um par só, a forma mais comum das regras da Seção 4.6. */
const cargaEstavel: Condicao = {
  pares: [{ criterio: 'previsibilidadeDaCarga', valor: 'estavel' }],
  descricao: 'A carga da aplicação é estável e previsível',
};

describe('avaliarCondicao', () => {
  it('satisfaz a conjunção quando todos os pares casam com as respostas', () => {
    const avaliacao = avaliarCondicao(valorAltoEQualidadeRuim, [
      respondeu('valorDeNegocio', 'alto'),
      respondeu('qualidadeTecnica', 'ruim'),
    ]);

    expect(avaliacao.resultado).toBe('satisfeita');
    expect(avaliacao.paresNaoSatisfeitos).toEqual([]);
    expect(avaliacao.criteriosDesconhecidos).toEqual([]);
    expect(avaliacao.criteriosSemResposta).toEqual([]);
  });

  it('devolve as respostas que satisfizeram a condição, para justificar a posição', () => {
    const valor = respondeu('valorDeNegocio', 'alto');
    const qualidade = respondeu('qualidadeTecnica', 'ruim');

    const avaliacao = avaliarCondicao(valorAltoEQualidadeRuim, [
      valor,
      qualidade,
      respondeu('previsibilidadeDaCarga', 'estavel'),
    ]);

    // Só as respostas dos critérios da condição, na ordem dos pares: a resposta
    // que não participa da condição não pode aparecer no motivo (Requisito 2.2).
    expect(avaliacao.respostasQueSatisfizeram).toEqual([valor, qualidade]);
  });

  it('não satisfaz quando uma resposta registrada contradiz um par', () => {
    const avaliacao = avaliarCondicao(valorAltoEQualidadeRuim, [
      respondeu('valorDeNegocio', 'baixo'),
      respondeu('qualidadeTecnica', 'ruim'),
    ]);

    expect(avaliacao.resultado).toBe('naoSatisfeita');
    expect(avaliacao.paresNaoSatisfeitos).toEqual([{ criterio: 'valorDeNegocio', valor: 'alto' }]);
    // Rastro parcial não é motivo: nada foi aplicado.
    expect(avaliacao.respostasQueSatisfizeram).toEqual([]);
  });

  it('fica indeterminada quando o critério foi respondido como "não sei"', () => {
    const avaliacao = avaliarCondicao(cargaEstavel, [naoSabe('previsibilidadeDaCarga')]);

    // Requisito 3.3: a regra que depende do critério deixa de ser aplicada, e a
    // condição não é violada — nenhuma estratégia é descartada por isso.
    expect(avaliacao.resultado).toBe('indeterminada');
    expect(avaliacao.criteriosDesconhecidos).toEqual(['previsibilidadeDaCarga']);
    expect(avaliacao.paresNaoSatisfeitos).toEqual([]);
    expect(avaliacao.respostasQueSatisfizeram).toEqual([]);
  });

  it('fica indeterminada quando o critério ainda não tem resposta registrada', () => {
    const avaliacao = avaliarCondicao(cargaEstavel, []);

    expect(avaliacao.resultado).toBe('indeterminada');
    expect(avaliacao.criteriosSemResposta).toEqual(['previsibilidadeDaCarga']);
    expect(avaliacao.criteriosDesconhecidos).toEqual([]);
  });

  it('distingue a origem da indeterminação entre "não sei" e resposta ausente', () => {
    const avaliacao = avaliarCondicao(valorAltoEQualidadeRuim, [naoSabe('valorDeNegocio')]);

    expect(avaliacao.resultado).toBe('indeterminada');
    expect(avaliacao.criteriosDesconhecidos).toEqual(['valorDeNegocio']);
    expect(avaliacao.criteriosSemResposta).toEqual(['qualidadeTecnica']);
  });

  it('não satisfaz quando um par contradiz e outro está indeterminado', () => {
    const avaliacao = avaliarCondicao(valorAltoEQualidadeRuim, [
      respondeu('valorDeNegocio', 'baixo'),
      naoSabe('qualidadeTecnica'),
    ]);

    // Em uma conjunção, um termo falso decide o todo: buscar a informação que
    // falta não muda o resultado.
    expect(avaliacao.resultado).toBe('naoSatisfeita');
  });

  it('casa quando o valor exigido está entre os valores de uma resposta múltipla', () => {
    const condicao: Condicao = {
      pares: [{ criterio: 'motivacao', valor: 'reducaoDeCusto' }],
      descricao: 'Redução de custo está entre as motivações declaradas',
    };

    const avaliacao = avaliarCondicao(condicao, [
      respondeu('motivacao', 'escalabilidade', 'reducaoDeCusto'),
    ]);

    // Valores de um critério não precisam ser mutuamente exclusivos
    // ([Mwilu2024], Requisito 5.4).
    expect(avaliacao.resultado).toBe('satisfeita');
  });

  it('não repete a resposta quando dois pares da condição usam o mesmo critério', () => {
    const condicao: Condicao = {
      pares: [
        { criterio: 'motivacao', valor: 'reducaoDeCusto' },
        { criterio: 'motivacao', valor: 'escalabilidade' },
      ],
      descricao: 'Redução de custo e escalabilidade estão entre as motivações',
    };
    const motivacao = respondeu('motivacao', 'reducaoDeCusto', 'escalabilidade');

    const avaliacao = avaliarCondicao(condicao, [motivacao]);

    expect(avaliacao.resultado).toBe('satisfeita');
    expect(avaliacao.respostasQueSatisfizeram).toEqual([motivacao]);
  });

  it('trata a última resposta do critério como a vigente, para acompanhar a revisão', () => {
    const avaliacao = avaliarCondicao(cargaEstavel, [
      respondeu('previsibilidadeDaCarga', 'variavel'),
      respondeu('previsibilidadeDaCarga', 'estavel'),
    ]);

    // Requisito 1.5: revisar uma resposta substitui o valor registrado.
    expect(avaliacao.resultado).toBe('satisfeita');
  });

  it('satisfaz por vacuidade a condição sem par algum', () => {
    const avaliacao = avaliarCondicao({ pares: [], descricao: 'Sempre' }, []);

    // A conjunção vazia é verdadeira. A verificação de consistência é quem acusa
    // esse conteúdo, porque a regra se aplicaria sempre.
    expect(avaliacao.resultado).toBe('satisfeita');
  });

  it('aceita as respostas já indexadas por critério', () => {
    const indice = indexarRespostasPorCriterio([respondeu('previsibilidadeDaCarga', 'estavel')]);

    expect(avaliarCondicao(cargaEstavel, indice).resultado).toBe('satisfeita');
  });
});

describe('atalhos de leitura', () => {
  it('condicaoSatisfeita só é verdadeira no estado satisfeito', () => {
    expect(condicaoSatisfeita(cargaEstavel, [respondeu('previsibilidadeDaCarga', 'estavel')])).toBe(
      true,
    );
    expect(condicaoSatisfeita(cargaEstavel, [respondeu('previsibilidadeDaCarga', 'variavel')])).toBe(
      false,
    );
    expect(condicaoSatisfeita(cargaEstavel, [naoSabe('previsibilidadeDaCarga')])).toBe(false);
    expect(condicaoSatisfeita(cargaEstavel, [])).toBe(false);
  });

  it('condicaoIndeterminada distingue a ausência de informação da contradição', () => {
    expect(condicaoIndeterminada(cargaEstavel, [naoSabe('previsibilidadeDaCarga')])).toBe(true);
    expect(condicaoIndeterminada(cargaEstavel, [])).toBe(true);
    expect(
      condicaoIndeterminada(cargaEstavel, [respondeu('previsibilidadeDaCarga', 'variavel')]),
    ).toBe(false);
    expect(
      condicaoIndeterminada(cargaEstavel, [respondeu('previsibilidadeDaCarga', 'estavel')]),
    ).toBe(false);
  });
});
