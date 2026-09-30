import { describe, expect, it } from 'vitest';
import { RAZAO_SEM_REGRA_CADASTRADA } from '../dominio/posicoes';
import type { Conteudo, Criterio, Id, Pergunta, Regra, Resposta } from '../dominio/tipos';
import {
  DECLARACAO_SEM_DISTINCAO,
  coletaEncerrada,
  encerrarColeta,
} from './encerramento';
import { proximaPergunta } from './selecao';

/**
 * O conteúdo é montado aqui, não lido de `src/conteudo/`: o encerramento precisa
 * valer para qualquer catálogo. Os cenários da Seção 8.2 do design, sobre o
 * conteúdo real, são tarefa à parte (5.5).
 *
 * O catálogo reproduz em miniatura o que o resultado precisa mostrar: uma
 * estratégia que a evidência favorece, uma eliminada por precondição, uma
 * empurrada apenas contra e uma sem regra alguma — o grupo "não avaliada pelo
 * Guia".
 */

const MOMENTO = '2026-01-01T10:00:00.000Z';

function respondeu(criterio: Id, ...valores: Id[]): Resposta {
  return { criterio, valor: { tipo: 'valores', valores }, momento: MOMENTO };
}

function naoSabe(criterio: Id): Resposta {
  return { criterio, valor: { tipo: 'desconhecida' }, momento: MOMENTO };
}

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
  criterio('valorDeNegocio', 'alto', 'baixo'),
  criterio('aversaoAAprisionamento', 'sim', 'nao'),
  criterio('compatibilidadeDeBanco', 'sim', 'nao'),
];

const PERGUNTAS: Pergunta[] = [
  {
    id: 'PA1',
    texto: 'A aplicação continuará em uso?',
    criterio: 'usoDaAplicacao',
    bloco: 'A',
    ordem: 1,
    estrategiasAfetadas: ['retain'],
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
    // Evidência de organização governamental de larga escala (Requisito 4.5).
    evidenciaApenasDePorteGrande: true,
  },
  {
    id: 'R-refactor-valor',
    condicao: {
      pares: [{ criterio: 'valorDeNegocio', valor: 'alto' }],
      descricao: 'A aplicação tem alto valor para o negócio',
    },
    estrategiaAlvo: 'refactor',
    tipoDeEfeito: 'contribuicao',
    direcao: 'favor',
    textoMotivo: 'Alto valor de negócio favorece reengenharia',
    estudosDeOrigem: ['[Kirkila2025]'],
    // Correspondência ao vocabulário dos 7Rs é interpretação (Requisito 2.5).
    ehInterpretacao: true,
    evidenciaApenasDePorteGrande: false,
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
    {
      // Nenhuma regra do corpus a favorece (Seção 6.1 dos requisitos).
      id: 'relocate',
      nome: 'Relocate',
      descricao: 'Mover o ambiente inteiro entre infraestruturas',
      temCaracterizacaoNoCorpus: false,
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

/** Estado da coleta com as respostas indicadas. */
function coleta(...respostas: Resposta[]) {
  return { conteudo: CONTEUDO, respostas };
}

/** Percorre a sessão inteira respondendo "não sei" a tudo que é apresentado. */
function respondendoNaoSeiATudo(): Resposta[] {
  const respostas: Resposta[] = [];
  for (let passo = 0; passo <= PERGUNTAS.length; passo += 1) {
    const pergunta = proximaPergunta({ conteudo: CONTEUDO, respostas });
    if (pergunta === undefined) break;
    respostas.push(naoSabe(pergunta.criterio));
  }
  return respostas;
}

describe('coletaEncerrada', () => {
  it('não encerra enquanto resta pergunta capaz de alterar o resultado', () => {
    expect(coletaEncerrada(coleta())).toBe(false);
  });

  it('encerra quando nenhuma pergunta pendente pode alterar o resultado', () => {
    // Requisito 1.4. O caminho regulado fixa Replatform e retira o Bloco E e o
    // Bloco F de circulação, de modo que quatro respostas esgotam o catálogo.
    const estado = coleta(
      respondeu('usoDaAplicacao', 'continua'),
      respondeu('restricaoRegulatoria', 'sim'),
      respondeu('previsibilidadeDaCarga', 'estavel'),
      respondeu('valorDeNegocio', 'alto'),
    );
    expect(coletaEncerrada(estado)).toBe(true);
  });
});

describe('encerrarColeta — encerramento por esgotamento das perguntas', () => {
  const estado = coleta(
    respondeu('usoDaAplicacao', 'continua'),
    respondeu('restricaoRegulatoria', 'sim'),
    respondeu('previsibilidadeDaCarga', 'estavel'),
    respondeu('valorDeNegocio', 'alto'),
  );
  const resultado = encerrarColeta(estado);

  it('declara o motivo do encerramento e não deixa pergunta na fila', () => {
    expect(resultado.motivoDeEncerramento).toBe('semPerguntaCapazDeAlterar');
    expect(resultado.perguntasNaoApresentadas).toEqual([]);
  });

  it('distribui as estratégias avaliadas pelas três faixas', () => {
    // Requisito 2.1. Retain soma duas contribuições a favor, Refactor uma, e
    // Replatform sai por precondição falhada.
    expect(resultado.recomendadas.map((posicao) => posicao.estrategia)).toEqual([
      'retain',
      'refactor',
    ]);
    expect(resultado.possiveis).toEqual([]);
    expect(resultado.naoRecomendadas.map((posicao) => posicao.estrategia)).toEqual(['replatform']);
    expect(resultado.posicoes.map((posicao) => posicao.estrategia)).toEqual([
      'retain',
      'refactor',
      'replatform',
    ]);
  });

  it('apresenta a justificativa de cada posição com a condição e a fonte', () => {
    // Requisitos 2.2 e 2.3.
    const retain = resultado.recomendadas[0];
    expect(retain.regrasAFavor.map((regra) => regra.condicaoSatisfeita.descricao)).toEqual([
      'Existe componente sob exigência regulatória',
      'A carga é estável e previsível',
    ]);
    expect(retain.regrasAFavor.flatMap((regra) => regra.estudosDeOrigem)).toEqual([
      '[Ramchand2021]',
      '[Dalakas2025]',
    ]);
    expect(retain.regrasAFavor[0].respostasQueSatisfizeram).toEqual([
      respondeu('restricaoRegulatoria', 'sim'),
    ]);
  });

  it('apresenta o motivo do descarte da estratégia não recomendada', () => {
    // Requisito 2.4.
    const replatform = resultado.naoRecomendadas[0];
    expect(replatform.precondicoesFalhadas).toHaveLength(1);
    expect(replatform.precondicoesFalhadas[0].textoMotivo).toBe(
      'Componente regulado impede a execução fora do ambiente atual',
    );
  });

  it('reúne o grupo das estratégias não avaliadas com a razão', () => {
    // Seção 5.4 do design: sem regra cadastrada, não é pontuada nem descartada.
    expect(resultado.naoAvaliadas).toEqual([
      { estrategia: 'relocate', razao: RAZAO_SEM_REGRA_CADASTRADA },
    ]);
  });

  it('propaga as marcações de interpretação e de porte', () => {
    // Requisitos 2.5 e 4.5.
    expect(resultado.estrategiasComMarcacaoDeInterpretacao).toEqual(['refactor']);
    expect(resultado.estrategiasComMarcacaoDePorte).toEqual(['retain']);
  });

  it('não declara resultado parcial quando toda pergunta apresentada foi respondida', () => {
    expect(resultado.ehParcial).toBe(false);
    expect(resultado.razoesDeResultadoParcial).toEqual([]);
    expect(resultado.criteriosSemResposta).toEqual([]);
  });

  it('não declara ausência de distinção quando alguma estratégia foi descartada', () => {
    // Requisito 2.6: a declaração só cabe quando nada foi descartado.
    expect(resultado.naoDistinguiuAlternativas).toBe(false);
    expect(resultado.declaracaoSemDistincao).toBeUndefined();
  });

  it('não altera o estado recebido', () => {
    expect(estado.respostas).toHaveLength(4);
    expect(estado.conteudo).toBe(CONTEUDO);
  });
});

describe('encerrarColeta — resultado parcial por resposta desconhecida', () => {
  const respostas = respondendoNaoSeiATudo();
  const resultado = encerrarColeta(coleta(...respostas));

  it('encerra normalmente, sem repetir pergunta', () => {
    // Seção 8.2 do design: "não sei" não quebra nada.
    expect(resultado.motivoDeEncerramento).toBe('semPerguntaCapazDeAlterar');
    expect(respostas.map((resposta) => resposta.criterio)).toEqual([
      'usoDaAplicacao',
      'restricaoRegulatoria',
      'previsibilidadeDaCarga',
      'valorDeNegocio',
      'aversaoAAprisionamento',
      'compatibilidadeDeBanco',
    ]);
  });

  it('declara o resultado parcial com a lista completa de critérios sem resposta', () => {
    // Requisito 3.4.
    expect(resultado.ehParcial).toBe(true);
    expect(resultado.razoesDeResultadoParcial).toEqual(['respostaDesconhecida']);
    expect(resultado.criteriosDeclaradosDesconhecidos).toEqual([
      'usoDaAplicacao',
      'restricaoRegulatoria',
      'previsibilidadeDaCarga',
      'valorDeNegocio',
      'aversaoAAprisionamento',
      'compatibilidadeDeBanco',
    ]);
    expect(resultado.criteriosNaoPerguntados).toEqual([]);
    expect(resultado.criteriosSemResposta).toEqual(resultado.criteriosDeclaradosDesconhecidos);
  });

  it('não descarta estratégia alguma e declara que a sessão não distinguiu alternativas', () => {
    // Requisitos 3.3 e 2.6.
    expect(resultado.naoRecomendadas).toEqual([]);
    expect(resultado.possiveis.map((posicao) => posicao.estrategia)).toEqual([
      'retain',
      'replatform',
      'refactor',
    ]);
    expect(resultado.possiveis.every((posicao) => posicao.nenhumaRegraAplicada)).toBe(true);
    expect(resultado.naoDistinguiuAlternativas).toBe(true);
    expect(resultado.declaracaoSemDistincao).toBe(DECLARACAO_SEM_DISTINCAO);
  });
});

describe('encerrarColeta — encerramento solicitado antes do fim', () => {
  const resultado = encerrarColeta(coleta(respondeu('usoDaAplicacao', 'continua')));

  it('declara que o encerramento foi pedido com perguntas ainda na fila', () => {
    expect(resultado.motivoDeEncerramento).toBe('solicitadoPeloUsuario');
    expect(resultado.perguntasNaoApresentadas.map((pergunta) => pergunta.id)).toEqual([
      'PB1',
      'PB2',
      'PC1',
      'PE1',
      'PF1',
    ]);
  });

  it('entrega o resultado do que foi registrado, declarado parcial', () => {
    expect(resultado.ehParcial).toBe(true);
    expect(resultado.razoesDeResultadoParcial).toEqual(['coletaEncerradaAntesDoFim']);
    expect(resultado.criteriosDeclaradosDesconhecidos).toEqual([]);
    expect(resultado.criteriosNaoPerguntados).toEqual([
      'restricaoRegulatoria',
      'previsibilidadeDaCarga',
      'valorDeNegocio',
      'aversaoAAprisionamento',
      'compatibilidadeDeBanco',
    ]);
    expect(resultado.naoRecomendadas).toEqual([]);
    expect(resultado.naoDistinguiuAlternativas).toBe(true);
  });

  it('soma as duas origens de lacuna sem repetir critério', () => {
    const misto = encerrarColeta(
      coleta(respondeu('usoDaAplicacao', 'continua'), naoSabe('valorDeNegocio')),
    );
    expect(misto.razoesDeResultadoParcial).toEqual([
      'respostaDesconhecida',
      'coletaEncerradaAntesDoFim',
    ]);
    expect(misto.criteriosSemResposta).toEqual([
      'valorDeNegocio',
      'restricaoRegulatoria',
      'previsibilidadeDaCarga',
      'aversaoAAprisionamento',
      'compatibilidadeDeBanco',
    ]);
  });

  it('não aponta como lacuna a pergunta que não poderia mudar o resultado', () => {
    // PE1 e PF1 saíram de circulação com Replatform fixada: declarar os seus
    // critérios como lacuna sugeriria informação faltante que não faz diferença.
    const regulado = encerrarColeta(
      coleta(
        respondeu('usoDaAplicacao', 'continua'),
        respondeu('restricaoRegulatoria', 'sim'),
      ),
    );
    expect(regulado.criteriosNaoPerguntados).toEqual([
      'previsibilidadeDaCarga',
      'valorDeNegocio',
    ]);
    expect(regulado.criteriosSemResposta).not.toContain('compatibilidadeDeBanco');
  });
});
