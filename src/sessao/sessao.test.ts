import { describe, expect, it } from 'vitest';
import type { Conteudo, Criterio, Id, Pergunta, Regra, Sessao } from '../dominio/tipos';
import {
  ErroDeRegistroDeResposta,
  RESPOSTA_DESCONHECIDA,
  abrirSessao,
  criteriosSemRespostaDe,
  registrarResposta,
  registrarRespostaDesconhecida,
  respostaDe,
} from './sessao';

/**
 * O conteúdo é montado aqui, não lido de `src/conteudo/`: o registro de
 * resposta precisa valer para qualquer catálogo. Os cenários sobre o conteúdo
 * real são tarefa à parte (5.5).
 *
 * O catálogo de teste tem o mínimo para exercitar o Requisito 3: um critério de
 * resposta única, um de resposta múltipla, uma contribuição e uma precondição
 * capaz de fixar estratégia.
 */

const MOMENTO = '2026-01-01T10:00:00.000Z';

function criterio(id: Id, valores: Id[], permiteRespostaMultipla = false): Criterio {
  return {
    id,
    nome: id,
    descricao: `Critério ${id}`,
    valores: valores.map((valor) => ({ id: valor, criterio: id, rotulo: valor })),
    permiteRespostaMultipla,
  };
}

const CRITERIOS: Criterio[] = [
  criterio('restricaoRegulatoria', ['sim', 'nao']),
  criterio('valorDeNegocio', ['alto', 'baixo']),
  criterio('motivadoresDaMigracao', ['custo', 'inovacao', 'suporte'], true),
];

const PERGUNTAS: Pergunta[] = [
  {
    id: 'PB1',
    texto: 'Existe componente sob exigência regulatória?',
    criterio: 'restricaoRegulatoria',
    bloco: 'B',
    ordem: 1,
    estrategiasAfetadas: ['retain', 'replatform'],
    fontes: ['[Ramchand2021]'],
  },
  {
    id: 'PC1',
    texto: 'Qual o valor da aplicação para o negócio?',
    criterio: 'valorDeNegocio',
    bloco: 'C',
    ordem: 1,
    estrategiasAfetadas: ['refactor'],
    fontes: ['[Kirkila2025]'],
  },
  {
    id: 'PE1',
    texto: 'O que motiva esta migração?',
    criterio: 'motivadoresDaMigracao',
    bloco: 'E',
    ordem: 1,
    estrategiasAfetadas: ['replatform'],
    fontes: ['[Kirkila2025]'],
  },
];

const REGRAS: Regra[] = [
  {
    // Incompatibilidade regulatória de [Ramchand2021]: precondição que elimina.
    id: 'R-precondicao-replatform',
    condicao: {
      pares: [{ criterio: 'restricaoRegulatoria', valor: 'sim' }],
      descricao: 'Existe componente sob exigência regulatória',
    },
    estrategiaAlvo: 'replatform',
    tipoDeEfeito: 'precondicao',
    direcao: 'contra',
    textoMotivo: 'Componente regulado impede a execução fora do ambiente atual',
    estudosDeOrigem: ['[Ramchand2021]'],
    ehInterpretacao: false,
    evidenciaApenasDePorteGrande: false,
  },
  {
    id: 'R-retain-favor',
    condicao: {
      pares: [{ criterio: 'restricaoRegulatoria', valor: 'sim' }],
      descricao: 'Existe componente sob exigência regulatória',
    },
    estrategiaAlvo: 'retain',
    tipoDeEfeito: 'contribuicao',
    direcao: 'favor',
    textoMotivo: 'Componente regulado favorece manter como está',
    estudosDeOrigem: ['[Ramchand2021]'],
    ehInterpretacao: false,
    evidenciaApenasDePorteGrande: false,
  },
  {
    id: 'R-refactor-favor',
    condicao: {
      pares: [{ criterio: 'valorDeNegocio', valor: 'alto' }],
      descricao: 'A aplicação tem alto valor para o negócio',
    },
    estrategiaAlvo: 'refactor',
    tipoDeEfeito: 'contribuicao',
    direcao: 'favor',
    textoMotivo: 'Alto valor de negócio favorece reengenharia',
    estudosDeOrigem: ['[Kirkila2025]'],
    ehInterpretacao: true,
    evidenciaApenasDePorteGrande: false,
  },
  {
    id: 'R-replatform-favor-inovacao',
    condicao: {
      pares: [{ criterio: 'motivadoresDaMigracao', valor: 'inovacao' }],
      descricao: 'Inovação é motivador declarado desta migração',
    },
    estrategiaAlvo: 'replatform',
    tipoDeEfeito: 'contribuicao',
    direcao: 'favor',
    textoMotivo: 'Inovação declarada favorece adaptar à plataforma alvo',
    estudosDeOrigem: ['[Kirkila2025]'],
    ehInterpretacao: true,
    evidenciaApenasDePorteGrande: false,
  },
];

const CONTEUDO: Conteudo = {
  criterios: CRITERIOS,
  perguntas: PERGUNTAS,
  estrategias: [
    {
      id: 'retain',
      nome: 'Retain',
      descricao: 'Manter como está',
      temCaracterizacaoNoCorpus: true,
    },
    {
      id: 'replatform',
      nome: 'Replatform',
      descricao: 'Adaptar à plataforma alvo',
      temCaracterizacaoNoCorpus: true,
    },
    {
      id: 'refactor',
      nome: 'Refactor',
      descricao: 'Reescrever ou reestruturar',
      temCaracterizacaoNoCorpus: true,
    },
  ],
  regras: REGRAS,
  estudos: [
    {
      id: '[Ramchand2021]',
      referencia: 'Ramchand; Chhetri; Kowalczyk (2021)',
      arquivoNoAcervo: 'springer/Enterprise adoption of cloud computing.pdf',
      contextoEmpirico: 'Caso real, 350 aplicações',
      porteAnalisado: 'Banco de porte médio',
    },
  ],
};

/** Sessão de teste, sobre o catálogo montado acima. */
function sessao(): Sessao {
  return abrirSessao({ conteudo: CONTEUDO, id: 'sessao-de-teste', inicio: MOMENTO });
}

/** Posição de uma estratégia no resultado do registro. */
function faixaDe(posicoes: { estrategia: Id; faixa: string }[], estrategia: Id) {
  return posicoes.find((posicao) => posicao.estrategia === estrategia)?.faixa;
}

describe('abrirSessao', () => {
  it('abre a sessão sem resposta alguma e sem critério sem resposta', () => {
    const aberta = sessao();
    expect(aberta.respostas).toEqual([]);
    expect(aberta.criteriosSemResposta).toEqual([]);
    expect(aberta.inicio).toBe(MOMENTO);
  });

  it('carrega o conteúdo vigente quando nenhum conteúdo é informado', () => {
    // Requisito 5.2: a leitura acontece na abertura, e a sessão trabalha sobre
    // ela até o fim.
    const aberta = abrirSessao();
    expect(aberta.conteudo.perguntas.length).toBeGreaterThan(0);
    expect(aberta.conteudo.regras.length).toBeGreaterThan(0);
    expect(aberta.id).not.toBe('');
  });
});

describe('registro de valor cadastrado', () => {
  it('registra o valor escolhido para o critério', () => {
    const { sessao: depois, resposta } = registrarResposta(
      sessao(),
      'valorDeNegocio',
      'alto',
      MOMENTO,
    );

    expect(resposta).toEqual({
      criterio: 'valorDeNegocio',
      valor: { tipo: 'valores', valores: ['alto'] },
      momento: MOMENTO,
    });
    expect(respostaDe(depois, 'valorDeNegocio')).toEqual(resposta);
    expect(depois.criteriosSemResposta).toEqual([]);
  });

  it('não altera a sessão recebida', () => {
    const antes = sessao();
    registrarResposta(antes, 'valorDeNegocio', 'alto', MOMENTO);
    expect(antes.respostas).toEqual([]);
  });

  it('registra mais de um valor quando o critério admite resposta múltipla', () => {
    const { resposta } = registrarResposta(
      sessao(),
      'motivadoresDaMigracao',
      ['custo', 'inovacao'],
      MOMENTO,
    );
    expect(resposta.valor).toEqual({ tipo: 'valores', valores: ['custo', 'inovacao'] });
  });

  it('seleciona a pergunta seguinte considerando as respostas já registradas', () => {
    // Requisito 1.2.
    const primeiro = registrarResposta(sessao(), 'restricaoRegulatoria', 'nao', MOMENTO);
    expect(primeiro.proximaPergunta?.id).toBe('PC1');

    const segundo = registrarResposta(primeiro.sessao, 'valorDeNegocio', 'alto', MOMENTO);
    expect(segundo.proximaPergunta?.id).toBe('PE1');
  });

  it('recalcula a posição das estratégias depois de cada resposta registrada', () => {
    const primeiro = registrarResposta(sessao(), 'restricaoRegulatoria', 'sim', MOMENTO);
    expect(faixaDe(primeiro.posicoes, 'retain')).toBe('recomendada');
    // Precondição regulatória falhada fixa Replatform.
    expect(faixaDe(primeiro.posicoes, 'replatform')).toBe('naoRecomendada');
    expect(faixaDe(primeiro.posicoes, 'refactor')).toBe('possivel');

    const segundo = registrarResposta(primeiro.sessao, 'valorDeNegocio', 'alto', MOMENTO);
    expect(faixaDe(segundo.posicoes, 'refactor')).toBe('recomendada');
  });

  it('mantém a estratégia fora de circulação sem reapresentar a pergunta dela', () => {
    // Replatform fixada retira PE1 de circulação (Requisito 1.4), então a
    // coleta termina depois do valor de negócio.
    const primeiro = registrarResposta(sessao(), 'restricaoRegulatoria', 'sim', MOMENTO);
    const segundo = registrarResposta(primeiro.sessao, 'valorDeNegocio', 'alto', MOMENTO);
    expect(segundo.proximaPergunta).toBeUndefined();
  });
});

describe('resposta desconhecida', () => {
  it('prossegue para a pergunta seguinte sem exigir justificativa nem estimativa', () => {
    // Requisito 3.2: o critério é o único dado necessário.
    const { proximaPergunta } = registrarRespostaDesconhecida(
      sessao(),
      'restricaoRegulatoria',
      MOMENTO,
    );
    expect(proximaPergunta?.id).toBe('PC1');
  });

  it('acumula o critério na lista de critérios sem resposta', () => {
    // Requisito 3.4.
    const primeiro = registrarRespostaDesconhecida(sessao(), 'restricaoRegulatoria', MOMENTO);
    const segundo = registrarResposta(primeiro.sessao, 'valorDeNegocio', 'alto', MOMENTO);
    const terceiro = registrarRespostaDesconhecida(
      segundo.sessao,
      'motivadoresDaMigracao',
      MOMENTO,
    );

    expect(primeiro.sessao.criteriosSemResposta).toEqual(['restricaoRegulatoria']);
    expect(segundo.sessao.criteriosSemResposta).toEqual(['restricaoRegulatoria']);
    expect(terceiro.sessao.criteriosSemResposta).toEqual([
      'restricaoRegulatoria',
      'motivadoresDaMigracao',
    ]);
  });

  it('não descarta estratégia alguma', () => {
    // Requisito 3.3: "não sei" em precondição deixa a estratégia disponível.
    const { posicoes } = registrarRespostaDesconhecida(sessao(), 'restricaoRegulatoria', MOMENTO);
    expect(faixaDe(posicoes, 'replatform')).toBe('possivel');
    expect(posicoes.every((posicao) => posicao.precondicoesFalhadas.length === 0)).toBe(true);
  });

  it('aceita a forma explícita de "não sei"', () => {
    const { resposta } = registrarResposta(
      sessao(),
      'valorDeNegocio',
      RESPOSTA_DESCONHECIDA,
      MOMENTO,
    );
    expect(resposta.valor).toEqual({ tipo: 'desconhecida' });
  });
});

describe('valor recusado', () => {
  function motivoDaRecusa(criterio: Id, valor: Parameters<typeof registrarResposta>[2]) {
    try {
      registrarResposta(sessao(), criterio, valor, MOMENTO);
    } catch (erro) {
      if (erro instanceof ErroDeRegistroDeResposta) return erro.motivo;
      throw erro;
    }
    return undefined;
  }

  it('recusa valor que não pertence ao critério', () => {
    expect(motivoDaRecusa('valorDeNegocio', 'medio')).toBe('valorNaoPertenceAoCriterio');
  });

  it('recusa mais de um valor em critério que não admite resposta múltipla', () => {
    expect(motivoDaRecusa('valorDeNegocio', ['alto', 'baixo'])).toBe(
      'respostaMultiplaNaoAdmitida',
    );
  });

  it('recusa lista de valores vazia', () => {
    expect(motivoDaRecusa('motivadoresDaMigracao', [])).toBe('semValor');
  });

  it('recusa o mesmo valor informado duas vezes', () => {
    expect(motivoDaRecusa('motivadoresDaMigracao', ['custo', 'custo'])).toBe('valorRepetido');
  });

  it('recusa critério que não está no conteúdo da sessão', () => {
    expect(motivoDaRecusa('criterioInventado', 'sim')).toBe('criterioInexistente');
  });

  it('recusa segundo registro do mesmo critério, que é revisão', () => {
    const { sessao: depois } = registrarResposta(sessao(), 'valorDeNegocio', 'alto', MOMENTO);
    expect(() => registrarResposta(depois, 'valorDeNegocio', 'baixo', MOMENTO)).toThrow(
      ErroDeRegistroDeResposta,
    );
  });

  it('não registra nada quando o valor é recusado', () => {
    const antes = sessao();
    expect(() => registrarResposta(antes, 'valorDeNegocio', 'medio', MOMENTO)).toThrow();
    expect(antes.respostas).toEqual([]);
  });
});

describe('criteriosSemRespostaDe', () => {
  it('lista apenas os critérios respondidos como desconhecidos, na ordem do registro', () => {
    expect(
      criteriosSemRespostaDe([
        { criterio: 'a', valor: { tipo: 'desconhecida' }, momento: MOMENTO },
        { criterio: 'b', valor: { tipo: 'valores', valores: ['x'] }, momento: MOMENTO },
        { criterio: 'c', valor: { tipo: 'desconhecida' }, momento: MOMENTO },
      ]),
    ).toEqual(['a', 'c']);
  });

  it('não repete critério cuja resposta desconhecida aparece mais de uma vez', () => {
    expect(
      criteriosSemRespostaDe([
        { criterio: 'a', valor: { tipo: 'desconhecida' }, momento: MOMENTO },
        { criterio: 'a', valor: { tipo: 'desconhecida' }, momento: MOMENTO },
      ]),
    ).toEqual(['a']);
  });
});
