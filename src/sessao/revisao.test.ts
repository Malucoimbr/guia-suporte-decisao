import { describe, expect, it } from 'vitest';
import { calcularPosicoes } from '../dominio/posicoes';
import type {
  Conteudo,
  Criterio,
  Id,
  Pergunta,
  Regra,
  Resposta,
  Sessao,
} from '../dominio/tipos';
import { encerrarColeta } from './encerramento';
import {
  podeRevisar,
  reconciliarRespostas,
  revisarResposta,
  revisarRespostaDesconhecida,
} from './revisao';
import { proximaPergunta } from './selecao';
import {
  ErroDeRegistroDeResposta,
  RESPOSTA_DESCONHECIDA,
  abrirSessao,
  registrarResposta,
  registrarRespostaDesconhecida,
  type ValorInformado,
} from './sessao';

/**
 * O conteúdo é montado aqui, não lido de `src/conteudo/`: a revisão precisa
 * valer para qualquer catálogo. Os cenários da Seção 8.2 do design sobre o
 * conteúdo real são tarefa à parte (5.5).
 *
 * O catálogo reproduz em miniatura o que a revisão precisa tratar: uma
 * precondição capaz de fixar uma estratégia ([Ramchand2021] em PB1), uma
 * pergunta que depende dessa estratégia continuar em jogo (PE1) e um Bloco F
 * condicionado a ela (PF1) — as duas respostas que uma revisão de PB1 pode
 * deixar órfãs.
 */

const MOMENTO = '2026-01-01T10:00:00.000Z';
const MOMENTO_DA_REVISAO = '2026-01-01T10:30:00.000Z';

function criterio(id: Id, ...valores: Id[]): Criterio {
  return {
    id,
    nome: id,
    descricao: `Critério ${id}`,
    valores: valores.map((valor) => ({ id: valor, criterio: id, rotulo: valor })),
    permiteRespostaMultipla: false,
  };
}

const CRITERIOS: Criterio[] = [
  criterio('usoDaAplicacao', 'continua', 'desativacao'),
  criterio('restricaoRegulatoria', 'sim', 'nao'),
  criterio('previsibilidadeDaCarga', 'estavel', 'variavel'),
  criterio('aversaoAAprisionamento', 'sim', 'nao'),
  criterio('compatibilidadeDeBanco', 'sim', 'nao'),
  // Cadastrado sem pergunta que o investigue: a seleção não o governa.
  criterio('fatorForaDoCatalogo', 'sim', 'nao'),
];

const PERGUNTAS: Pergunta[] = [
  {
    id: 'PA1',
    texto: 'A aplicação continuará em uso?',
    criterio: 'usoDaAplicacao',
    bloco: 'A',
    ordem: 1,
    estrategiasAfetadas: ['refactor'],
    fontes: ['[Ramchand2021]'],
  },
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
    id: 'PB2',
    texto: 'Como se comporta a carga ao longo do ano?',
    criterio: 'previsibilidadeDaCarga',
    bloco: 'B',
    ordem: 2,
    estrategiasAfetadas: ['retain'],
    fontes: ['[Dalakas2025]'],
  },
  {
    id: 'PE1',
    texto: 'Depender de um provedor é preocupação relevante?',
    criterio: 'aversaoAAprisionamento',
    bloco: 'E',
    ordem: 1,
    estrategiasAfetadas: ['replatform'],
    fontes: ['[Bremer2021]'],
  },
  {
    // Bloco F: verificação de PaaS, só apresentada com Replatform em jogo.
    id: 'PF1',
    texto: 'O banco de dados tem equivalente compatível na plataforma?',
    criterio: 'compatibilidadeDeBanco',
    bloco: 'F',
    ordem: 1,
    condicaoDeExibicao: { estrategiasEmJogo: ['replatform'] },
    estrategiasAfetadas: ['replatform'],
    fontes: ['[Khouibiri2024]'],
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
    // Verificação obrigatória de PaaS de [Khouibiri2024].
    id: 'R-precondicao-banco',
    condicao: {
      pares: [{ criterio: 'compatibilidadeDeBanco', valor: 'nao' }],
      descricao: 'O banco de dados não tem equivalente compatível na plataforma',
    },
    estrategiaAlvo: 'replatform',
    tipoDeEfeito: 'precondicao',
    direcao: 'contra',
    textoMotivo: 'Sem equivalente de banco, a plataforma gerenciada não recebe a aplicação',
    estudosDeOrigem: ['[Khouibiri2024]'],
    ehInterpretacao: false,
    evidenciaApenasDePorteGrande: false,
  },
  {
    id: 'R-replatform-lockin',
    condicao: {
      pares: [{ criterio: 'aversaoAAprisionamento', valor: 'sim' }],
      descricao: 'Depender de um provedor é preocupação relevante',
    },
    estrategiaAlvo: 'replatform',
    tipoDeEfeito: 'contribuicao',
    direcao: 'contra',
    textoMotivo: 'Aversão a aprisionamento desfavorece alvos PaaS',
    estudosDeOrigem: ['[Bremer2021]', '[Khouibiri2024]'],
    ehInterpretacao: false,
    evidenciaApenasDePorteGrande: false,
  },
  {
    id: 'R-retain-regulado',
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
    id: 'R-retain-carga',
    condicao: {
      pares: [{ criterio: 'previsibilidadeDaCarga', valor: 'estavel' }],
      descricao: 'A carga é estável e previsível',
    },
    estrategiaAlvo: 'retain',
    tipoDeEfeito: 'contribuicao',
    direcao: 'favor',
    textoMotivo: 'Sob carga estável, contrato e depreciação favorecem permanecer',
    estudosDeOrigem: ['[Dalakas2025]'],
    ehInterpretacao: false,
    evidenciaApenasDePorteGrande: true,
  },
  {
    id: 'R-refactor-desativacao',
    condicao: {
      pares: [{ criterio: 'usoDaAplicacao', valor: 'desativacao' }],
      descricao: 'A aplicação está prevista para desativação',
    },
    estrategiaAlvo: 'refactor',
    tipoDeEfeito: 'contribuicao',
    direcao: 'contra',
    textoMotivo: 'Não se reescreve aplicação que sai do ar',
    estudosDeOrigem: ['[Ramchand2021]'],
    ehInterpretacao: false,
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

/** Sessão vazia sobre o catálogo do teste, com identificador e início fixos. */
function sessaoVazia(): Sessao {
  return abrirSessao({ conteudo: CONTEUDO, id: 'sessao-de-teste', inicio: MOMENTO });
}

/** Registra as respostas indicadas, na ordem informada. */
function sessaoCom(...respostas: readonly [Id, ValorInformado][]): Sessao {
  return respostas.reduce(
    (sessao, [criterioRespondido, valor]) =>
      registrarResposta(sessao, criterioRespondido, valor, MOMENTO).sessao,
    sessaoVazia(),
  );
}

/**
 * Conduz uma sessão nova respondendo o que a seleção apresentar, com os valores
 * desejados. É a "sessão iniciada já com o valor novo" da Seção 8.2 do design.
 */
function sessaoConduzida(desejadas: Readonly<Record<Id, ValorInformado>>): Sessao {
  let sessao = sessaoVazia();
  for (let passo = 0; passo <= PERGUNTAS.length; passo += 1) {
    const pergunta = proximaPergunta(sessao);
    if (pergunta === undefined) break;
    const valor = desejadas[pergunta.criterio];
    if (valor === undefined) break;
    sessao = registrarResposta(sessao, pergunta.criterio, valor, MOMENTO).sessao;
  }
  return sessao;
}

/** Faixa de cada estratégia avaliada, na ordem de apresentação. */
function faixas(posicoes: readonly { estrategia: Id; faixa: string }[]): [Id, string][] {
  return posicoes.map((posicao) => [posicao.estrategia, posicao.faixa]);
}

function respostaDe(sessao: Sessao, criterioProcurado: Id): Resposta | undefined {
  return sessao.respostas.find((resposta) => resposta.criterio === criterioProcurado);
}

describe('revisarResposta — substituição e recálculo', () => {
  // Requisito 1.5. Carga estável favorece Retain ([Dalakas2025]); revista para
  // variável, a contribuição desaparece e a estratégia volta a "possível".
  const sessao = sessaoCom(
    ['usoDaAplicacao', 'continua'],
    ['restricaoRegulatoria', 'nao'],
    ['previsibilidadeDaCarga', 'estavel'],
  );
  const revisao = revisarResposta(
    sessao,
    'previsibilidadeDaCarga',
    'variavel',
    MOMENTO_DA_REVISAO,
  );

  it('substitui o valor registrado, mantendo a posição na sessão', () => {
    expect(revisao.respostaAnterior).toEqual({
      criterio: 'previsibilidadeDaCarga',
      valor: { tipo: 'valores', valores: ['estavel'] },
      momento: MOMENTO,
    });
    expect(revisao.resposta).toEqual({
      criterio: 'previsibilidadeDaCarga',
      valor: { tipo: 'valores', valores: ['variavel'] },
      momento: MOMENTO_DA_REVISAO,
    });
    expect(revisao.sessao.respostas.map((resposta) => resposta.criterio)).toEqual([
      'usoDaAplicacao',
      'restricaoRegulatoria',
      'previsibilidadeDaCarga',
    ]);
    expect(respostaDe(revisao.sessao, 'previsibilidadeDaCarga')).toEqual(revisao.resposta);
  });

  it('recalcula a posição de todas as estratégias', () => {
    expect(faixas(calcularPosicoes(CONTEUDO, sessao.respostas))).toEqual([
      ['retain', 'recomendada'],
      ['replatform', 'possivel'],
      ['refactor', 'possivel'],
    ]);
    expect(faixas(revisao.posicoes)).toEqual([
      ['retain', 'possivel'],
      ['replatform', 'possivel'],
      ['refactor', 'possivel'],
    ]);
  });

  it('não invalida resposta alguma quando nada saiu de circulação', () => {
    expect(revisao.respostasInvalidadas).toEqual([]);
    expect(revisao.proximaPergunta?.id).toBe('PE1');
  });

  it('não altera a sessão recebida', () => {
    expect(respostaDe(sessao, 'previsibilidadeDaCarga')?.valor).toEqual({
      tipo: 'valores',
      valores: ['estavel'],
    });
    expect(sessao.respostas).toHaveLength(3);
  });
});

describe('revisarResposta — "não sei" nos dois sentidos', () => {
  it('revisar "não sei" para um valor tira o critério da lista de critérios sem resposta', () => {
    // Requisitos 3.4 e 1.5: a lista é derivada das respostas, não acumulada.
    const sessao = registrarRespostaDesconhecida(
      sessaoCom(['usoDaAplicacao', 'continua'], ['restricaoRegulatoria', 'nao']),
      'previsibilidadeDaCarga',
      MOMENTO,
    ).sessao;
    expect(sessao.criteriosSemResposta).toEqual(['previsibilidadeDaCarga']);

    const revisao = revisarResposta(
      sessao,
      'previsibilidadeDaCarga',
      'estavel',
      MOMENTO_DA_REVISAO,
    );
    expect(revisao.sessao.criteriosSemResposta).toEqual([]);
    expect(faixas(revisao.posicoes)).toEqual([
      ['retain', 'recomendada'],
      ['replatform', 'possivel'],
      ['refactor', 'possivel'],
    ]);
  });

  it('revisar um valor para "não sei" põe o critério na lista e desliga a regra', () => {
    // Requisito 3.3: a regra deixa de se aplicar sem descartar estratégia.
    const sessao = sessaoCom(
      ['usoDaAplicacao', 'continua'],
      ['restricaoRegulatoria', 'sim'],
      ['previsibilidadeDaCarga', 'estavel'],
    );
    const revisao = revisarRespostaDesconhecida(sessao, 'restricaoRegulatoria', MOMENTO_DA_REVISAO);

    expect(revisao.sessao.criteriosSemResposta).toEqual(['restricaoRegulatoria']);
    expect(revisao.resposta.valor).toEqual(RESPOSTA_DESCONHECIDA);
    // Replatform sai de "não recomendada": precondição sem resposta não elimina.
    expect(faixas(revisao.posicoes)).toEqual([
      ['retain', 'recomendada'],
      ['replatform', 'possivel'],
      ['refactor', 'possivel'],
    ]);
  });
});

describe('revisarResposta — respostas que perdem o fundamento', () => {
  // Requisito 1.5, efeito colateral: PE1 e PF1 só foram apresentadas porque
  // Replatform estava em jogo. A revisão que faz a precondição regulatória de
  // [Ramchand2021] falhar retira as duas de circulação.
  const sessao = sessaoCom(
    ['usoDaAplicacao', 'continua'],
    ['restricaoRegulatoria', 'nao'],
    ['previsibilidadeDaCarga', 'estavel'],
    ['aversaoAAprisionamento', 'nao'],
    ['compatibilidadeDeBanco', 'sim'],
  );
  const revisao = revisarResposta(sessao, 'restricaoRegulatoria', 'sim', MOMENTO_DA_REVISAO);

  it('descarta as respostas cuja pergunta deixou de ser apresentável', () => {
    expect(revisao.respostasInvalidadas.map((resposta) => resposta.criterio)).toEqual([
      'aversaoAAprisionamento',
      'compatibilidadeDeBanco',
    ]);
    expect(revisao.sessao.respostas.map((resposta) => resposta.criterio)).toEqual([
      'usoDaAplicacao',
      'restricaoRegulatoria',
      'previsibilidadeDaCarga',
    ]);
  });

  it('recalcula as posições sem as respostas invalidadas e encerra a coleta', () => {
    expect(faixas(revisao.posicoes)).toEqual([
      ['retain', 'recomendada'],
      ['refactor', 'possivel'],
      ['replatform', 'naoRecomendada'],
    ]);
    expect(revisao.proximaPergunta).toBeUndefined();
  });

  it('apresenta de novo a pergunta que voltou a circular, sem invalidar nada', () => {
    // O caminho inverso: devolver Replatform ao jogo traz PE1 de volta.
    const regulada = sessaoCom(
      ['usoDaAplicacao', 'continua'],
      ['restricaoRegulatoria', 'sim'],
      ['previsibilidadeDaCarga', 'estavel'],
    );
    expect(proximaPergunta(regulada)).toBeUndefined();

    const volta = revisarResposta(regulada, 'restricaoRegulatoria', 'nao', MOMENTO_DA_REVISAO);
    expect(volta.respostasInvalidadas).toEqual([]);
    expect(volta.proximaPergunta?.id).toBe('PE1');
  });
});

describe('revisarResposta — equivalência com a sessão iniciada com o valor novo', () => {
  // Seção 8.2 do design: alterar uma resposta produz o mesmo resultado de uma
  // sessão iniciada já com o valor novo.
  const revisada = revisarResposta(
    sessaoCom(
      ['usoDaAplicacao', 'continua'],
      ['restricaoRegulatoria', 'nao'],
      ['previsibilidadeDaCarga', 'estavel'],
      ['aversaoAAprisionamento', 'nao'],
      ['compatibilidadeDeBanco', 'sim'],
    ),
    'restricaoRegulatoria',
    'sim',
    MOMENTO,
  ).sessao;

  const doZero = sessaoConduzida({
    usoDaAplicacao: 'continua',
    restricaoRegulatoria: 'sim',
    previsibilidadeDaCarga: 'estavel',
    aversaoAAprisionamento: 'nao',
    compatibilidadeDeBanco: 'sim',
  });

  it('registra as mesmas respostas', () => {
    expect(revisada.respostas).toEqual(doZero.respostas);
    expect(revisada.criteriosSemResposta).toEqual(doZero.criteriosSemResposta);
  });

  it('produz o mesmo resultado', () => {
    expect(encerrarColeta(revisada)).toEqual(encerrarColeta(doZero));
  });

  it('vale também quando a revisão é para "não sei"', () => {
    const paraNaoSei = revisarRespostaDesconhecida(
      sessaoCom(['usoDaAplicacao', 'continua'], ['restricaoRegulatoria', 'sim']),
      'restricaoRegulatoria',
      MOMENTO,
    ).sessao;
    const equivalente = sessaoConduzida({
      usoDaAplicacao: 'continua',
      restricaoRegulatoria: RESPOSTA_DESCONHECIDA,
    });

    expect(paraNaoSei.respostas).toEqual(equivalente.respostas);
    expect(encerrarColeta(paraNaoSei)).toEqual(encerrarColeta(equivalente));
  });
});

describe('reconciliarRespostas', () => {
  it('preserva resposta de critério que nenhuma pergunta investiga', () => {
    const foraDoCatalogo: Resposta = {
      criterio: 'fatorForaDoCatalogo',
      valor: { tipo: 'valores', valores: ['sim'] },
      momento: MOMENTO,
    };
    const { mantidas, invalidadas } = reconciliarRespostas(CONTEUDO, [foraDoCatalogo]);

    expect(mantidas).toEqual([foraDoCatalogo]);
    expect(invalidadas).toEqual([]);
  });

  it('mantém intacta a lista que a seleção teria colhido', () => {
    const respostas = sessaoCom(
      ['usoDaAplicacao', 'continua'],
      ['restricaoRegulatoria', 'nao'],
      ['aversaoAAprisionamento', 'sim'],
    ).respostas;
    const { mantidas, invalidadas } = reconciliarRespostas(CONTEUDO, respostas);

    expect(mantidas).toEqual(respostas);
    expect(invalidadas).toEqual([]);
  });

  it('descarta em cadeia quando a primeira resposta retira as seguintes de circulação', () => {
    const respostas: Resposta[] = [
      { criterio: 'restricaoRegulatoria', valor: { tipo: 'valores', valores: ['sim'] }, momento: MOMENTO },
      { criterio: 'aversaoAAprisionamento', valor: { tipo: 'valores', valores: ['sim'] }, momento: MOMENTO },
      { criterio: 'compatibilidadeDeBanco', valor: { tipo: 'valores', valores: ['nao'] }, momento: MOMENTO },
    ];
    const { mantidas, invalidadas } = reconciliarRespostas(CONTEUDO, respostas);

    expect(mantidas.map((resposta) => resposta.criterio)).toEqual(['restricaoRegulatoria']);
    expect(invalidadas.map((resposta) => resposta.criterio)).toEqual([
      'aversaoAAprisionamento',
      'compatibilidadeDeBanco',
    ]);
  });
});

describe('revisarResposta — recusas', () => {
  const sessao = sessaoCom(['usoDaAplicacao', 'continua']);

  it('recusa critério que não está no conteúdo da sessão', () => {
    expect(() => revisarResposta(sessao, 'inexistente', 'sim')).toThrowError(
      ErroDeRegistroDeResposta,
    );
    try {
      revisarResposta(sessao, 'inexistente', 'sim');
    } catch (erro) {
      expect((erro as ErroDeRegistroDeResposta).motivo).toBe('criterioInexistente');
    }
  });

  it('recusa critério sem resposta registrada: a primeira resposta é registro', () => {
    try {
      revisarResposta(sessao, 'previsibilidadeDaCarga', 'estavel');
      expect.unreachable('a revisão deveria ter sido recusada');
    } catch (erro) {
      expect((erro as ErroDeRegistroDeResposta).motivo).toBe('criterioSemRespostaRegistrada');
      expect((erro as ErroDeRegistroDeResposta).criterio).toBe('previsibilidadeDaCarga');
    }
  });

  it('recusa valor que não pertence ao critério', () => {
    try {
      revisarResposta(sessao, 'usoDaAplicacao', 'talvez');
      expect.unreachable('a revisão deveria ter sido recusada');
    } catch (erro) {
      expect((erro as ErroDeRegistroDeResposta).motivo).toBe('valorNaoPertenceAoCriterio');
    }
  });
});

describe('podeRevisar', () => {
  it('distingue o critério já respondido do que ainda não foi', () => {
    const sessao = sessaoCom(['usoDaAplicacao', 'continua']);
    expect(podeRevisar(sessao, 'usoDaAplicacao')).toBe(true);
    expect(podeRevisar(sessao, 'previsibilidadeDaCarga')).toBe(false);
  });
});
