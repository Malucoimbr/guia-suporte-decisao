import { describe, expect, it } from 'vitest';
import type {
  Conteudo,
  Criterio,
  Id,
  Pergunta,
  Regra,
  Resposta,
} from '../dominio/tipos';
import {
  avaliarAplicabilidade,
  diagnosticarPerguntas,
  estrategiasFixadas,
  ordenarPerguntas,
  perguntasAplicaveis,
  proximaPergunta,
} from './selecao';

/**
 * O conteúdo é montado aqui, não lido de `src/conteudo/`: a seleção precisa
 * valer para qualquer catálogo, e o conteúdo do repositório ainda está sendo
 * cadastrado. Os cenários da Seção 8.2 do design, sobre o conteúdo real, são
 * tarefa à parte (5.5).
 *
 * O catálogo de teste reproduz em miniatura o que a Seção 4 do design descreve:
 * blocos em ordem, uma pergunta com condição sobre respostas, uma pergunta
 * condicionada a estratégia em jogo — o Bloco F — e uma precondição capaz de
 * fixar estratégia.
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
  criterio('volumeDeCodigo', 'grande', 'pequena'),
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
    estrategiasAfetadas: ['retain', 'replatform'],
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
    // Condição sobre respostas já registradas: só se pergunta o volume de
    // código de aplicação que vale a pena reescrever.
    id: 'PD1',
    texto: 'Qual o tamanho da base de código?',
    criterio: 'volumeDeCodigo',
    bloco: 'D',
    ordem: 1,
    condicaoDeExibicao: {
      respostas: {
        pares: [{ criterio: 'valorDeNegocio', valor: 'alto' }],
        descricao: 'A aplicação tem alto valor para o negócio',
      },
    },
    estrategiasAfetadas: ['refactor'],
    fontes: ['[Fonseca2024]'],
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
];

const CONTEUDO: Conteudo = {
  criterios: CRITERIOS,
  perguntas: PERGUNTAS,
  estrategias: [
    { id: 'retain', nome: 'Retain', descricao: 'Manter como está', temCaracterizacaoNoCorpus: true },
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

/** Estado da coleta com as respostas indicadas. */
function coleta(...respostas: Resposta[]) {
  return { conteudo: CONTEUDO, respostas };
}

/** Motivo pelo qual a pergunta não foi apresentada. */
function motivoDe(id: Id, ...respostas: Resposta[]) {
  const pergunta = PERGUNTAS.find((p) => p.id === id);
  if (pergunta === undefined) throw new Error(`pergunta ${id} inexistente no catálogo de teste`);
  return avaliarAplicabilidade(pergunta, coleta(...respostas));
}

describe('ordenarPerguntas', () => {
  it('ordena por bloco e, dentro do bloco, pelo campo ordem', () => {
    const embaralhadas = [
      PERGUNTAS[6], // F 1
      PERGUNTAS[2], // B 2
      PERGUNTAS[0], // A 1
      PERGUNTAS[4], // D 1
      PERGUNTAS[1], // B 1
      PERGUNTAS[5], // E 1
      PERGUNTAS[3], // C 1
    ];

    expect(ordenarPerguntas(embaralhadas).map((p) => p.id)).toEqual([
      'PA1',
      'PB1',
      'PB2',
      'PC1',
      'PD1',
      'PE1',
      'PF1',
    ]);
  });

  it('não altera a lista recebida', () => {
    const original = [PERGUNTAS[6], PERGUNTAS[0]];
    ordenarPerguntas(original);
    expect(original.map((p) => p.id)).toEqual(['PF1', 'PA1']);
  });
});

describe('proximaPergunta', () => {
  it('apresenta a primeira pergunta do Bloco A quando a sessão começa', () => {
    expect(proximaPergunta(coleta())?.id).toBe('PA1');
  });

  it('não reapresenta pergunta já respondida', () => {
    expect(proximaPergunta(coleta(respondeu('usoDaAplicacao', 'continua')))?.id).toBe('PB1');
  });

  it('trata "não sei" como resposta registrada e prossegue para a seguinte', () => {
    // Requisito 3.2: "não sei" não interrompe a coleta nem devolve a pergunta.
    const estado = coleta(naoSabe('usoDaAplicacao'), naoSabe('restricaoRegulatoria'));
    expect(proximaPergunta(estado)?.id).toBe('PB2');
    expect(motivoDe('PA1', naoSabe('usoDaAplicacao')).motivo).toBe('jaRespondida');
  });

  it('encerra a coleta quando nenhuma pergunta pendente pode alterar o resultado', () => {
    // Percorre a sessão inteira respondendo "não sei", que é o caminho que mais
    // preserva perguntas: nada é fixado, então tudo que é aplicável aparece.
    const respostas: Resposta[] = [];
    const apresentadas: Id[] = [];

    for (let passo = 0; passo < PERGUNTAS.length + 1; passo += 1) {
      const pergunta = proximaPergunta({ conteudo: CONTEUDO, respostas });
      if (pergunta === undefined) break;
      apresentadas.push(pergunta.id);
      respostas.push(naoSabe(pergunta.criterio));
    }

    expect(proximaPergunta({ conteudo: CONTEUDO, respostas })).toBeUndefined();
    // Nenhuma repetição, e PD1 fica de fora porque a sua condição de exibição
    // depende de resposta que ficou desconhecida.
    expect(apresentadas).toEqual(['PA1', 'PB1', 'PB2', 'PC1', 'PE1', 'PF1']);
  });
});

describe('condição de exibição sobre as respostas registradas', () => {
  it('apresenta a pergunta quando a condição declarada está satisfeita', () => {
    const estado = coleta(respondeu('valorDeNegocio', 'alto'));
    expect(perguntasAplicaveis(estado).map((p) => p.id)).toContain('PD1');
  });

  it('não apresenta quando uma resposta registrada contradiz a condição', () => {
    expect(motivoDe('PD1', respondeu('valorDeNegocio', 'baixo'))).toMatchObject({
      aplicavel: false,
      motivo: 'condicaoSobreRespostasNaoSatisfeita',
    });
  });

  it('não apresenta enquanto o critério da condição não tem resposta', () => {
    // Requisito 1.3: a condição precisa ser satisfeita pelas respostas **já
    // registradas**; indeterminada não basta.
    expect(motivoDe('PD1').motivo).toBe('condicaoSobreRespostasNaoSatisfeita');
  });

  it('não apresenta quando o critério da condição foi respondido como "não sei"', () => {
    expect(motivoDe('PD1', naoSabe('valorDeNegocio')).motivo).toBe(
      'condicaoSobreRespostasNaoSatisfeita',
    );
  });
});

describe('condição de exibição sobre estratégias em jogo', () => {
  it('apresenta o Bloco F enquanto a estratégia exigida continua em jogo', () => {
    expect(motivoDe('PF1', respondeu('restricaoRegulatoria', 'nao')).aplicavel).toBe(true);
  });

  it('retira o Bloco F quando a estratégia exigida sai de circulação', () => {
    const regulado = respondeu('restricaoRegulatoria', 'sim');
    expect(estrategiasFixadas(CONTEUDO, [regulado]).has('replatform')).toBe(true);
    expect(motivoDe('PF1', regulado)).toMatchObject({
      aplicavel: false,
      motivo: 'estrategiaExigidaFixada',
    });
  });

  it('mantém o Bloco F quando a precondição ficou sem resposta', () => {
    // Requisito 3.3: "não sei" em precondição não elimina a estratégia, então o
    // bloco condicionado a ela continua fazendo sentido.
    expect(estrategiasFixadas(CONTEUDO, [naoSabe('restricaoRegulatoria')]).size).toBe(0);
    expect(motivoDe('PF1', naoSabe('restricaoRegulatoria')).aplicavel).toBe(true);
  });
});

describe('economia de perguntas', () => {
  it('retira a pergunta cujas estratégias afetadas já estão todas fixadas', () => {
    // PE1 afeta só Replatform, eliminada pela precondição regulatória.
    expect(motivoDe('PE1', respondeu('restricaoRegulatoria', 'sim'))).toMatchObject({
      aplicavel: false,
      motivo: 'estrategiasAfetadasFixadas',
    });
  });

  it('mantém a pergunta quando ao menos uma estratégia afetada segue em jogo', () => {
    // PB2 afeta Retain e Replatform; só Replatform saiu.
    expect(motivoDe('PB2', respondeu('restricaoRegulatoria', 'sim')).aplicavel).toBe(true);
  });

  it('não apresenta pergunta que não afeta estratégia alguma', () => {
    const semAfetadas: Pergunta = { ...PERGUNTAS[0], id: 'PX', estrategiasAfetadas: [] };
    expect(avaliarAplicabilidade(semAfetadas, coleta())).toMatchObject({
      aplicavel: false,
      motivo: 'semEstrategiaAfetada',
    });
  });

  it('encurta a sessão depois de uma resposta que fixa estratégia', () => {
    const diagnostico = diagnosticarPerguntas(coleta(respondeu('restricaoRegulatoria', 'sim')));
    const excluidas = diagnostico.filter((item) => !item.aplicavel).map((item) => item.pergunta.id);

    // PB1 já foi respondida; PD1 espera o valor de negócio; PE1 e PF1 saíram
    // porque Replatform está fixada.
    expect(excluidas).toEqual(['PB1', 'PD1', 'PE1', 'PF1']);
    expect(diagnostico.filter((item) => item.aplicavel).map((item) => item.pergunta.id)).toEqual([
      'PA1',
      'PB2',
      'PC1',
    ]);
  });
});
