import { describe, expect, it } from 'vitest';
import { carregarConteudo } from '../dominio/carga';
import type { Conteudo, Criterio, Id, Pergunta, Regra, Resposta } from '../dominio/tipos';
import {
  DECLARACAO_SEM_EFEITO,
  ErroDeVisaoESe,
  lacunasDeInformacao,
  visaoESe,
  visoesESe,
} from './eSe';
import { proximaPergunta } from './selecao';

/**
 * O conteúdo é montado aqui, não lido de `src/conteudo/`: a visão "e se" precisa
 * valer para qualquer catálogo. O último bloco de testes é o único que usa o
 * conteúdo real, para confirmar que o cálculo se comporta sobre as regras
 * cadastradas.
 *
 * O catálogo em miniatura tem o necessário para as três situações que interessam
 * ao Requisito 3.5: um critério cujo valor muda faixa de estratégia, um critério
 * cujo valor não muda nada, e um critério que fixa estratégia por precondição e
 * portanto derruba respostas posteriores.
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
  criterio('restricaoRegulatoria', 'sim', 'nao'),
  criterio('previsibilidadeDaCarga', 'estavel', 'variavel'),
  criterio('valorDeNegocio', 'alto', 'baixo'),
  criterio('compatibilidadeDeBanco', 'sim', 'nao'),
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
    // Bloco F: só aparece com Replatform em jogo.
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
    id: 'R-precondicao-banco',
    condicao: {
      pares: [{ criterio: 'compatibilidadeDeBanco', valor: 'nao' }],
      descricao: 'O banco de dados não tem equivalente na plataforma',
    },
    estrategiaAlvo: 'replatform',
    tipoDeEfeito: 'precondicao',
    direcao: 'contra',
    textoMotivo: 'Verificação obrigatória de banco de dados não passou',
    estudosDeOrigem: ['[Khouibiri2024]'],
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
    ehInterpretacao: true,
    evidenciaApenasDePorteGrande: false,
  },
  {
    id: 'R-refactor-valor-baixo',
    condicao: {
      pares: [{ criterio: 'valorDeNegocio', valor: 'baixo' }],
      descricao: 'A aplicação tem baixo valor para o negócio',
    },
    estrategiaAlvo: 'refactor',
    tipoDeEfeito: 'contribuicao',
    direcao: 'contra',
    textoMotivo: 'Baixo valor de negócio não sustenta reengenharia',
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
    {
      id: 'relocate',
      nome: 'Relocate',
      descricao: 'Mover o ambiente inteiro entre infraestruturas',
      temCaracterizacaoNoCorpus: false,
    },
  ],
  regras: REGRAS,
  estudos: [],
};

function coleta(...respostas: Resposta[]) {
  return { conteudo: CONTEUDO, respostas };
}

describe('lacunasDeInformacao', () => {
  it('lista as duas origens de lacuna, na ordem do resultado parcial', () => {
    // Requisito 3.4: primeiro os declarados desconhecidos, depois os das
    // perguntas que ficaram na fila.
    const lacunas = lacunasDeInformacao(
      coleta(respondeu('restricaoRegulatoria', 'nao'), naoSabe('previsibilidadeDaCarga')),
    );

    expect(
      lacunas.map((lacuna) => [lacuna.criterio.id, lacuna.origem]),
    ).toEqual([
      ['previsibilidadeDaCarga', 'respostaDesconhecida'],
      ['valorDeNegocio', 'perguntaNaoApresentada'],
      ['compatibilidadeDeBanco', 'perguntaNaoApresentada'],
    ]);
  });

  it('não lista critério que já tem valor registrado', () => {
    const lacunas = lacunasDeInformacao(coleta(respondeu('previsibilidadeDaCarga', 'estavel')));
    expect(lacunas.map((lacuna) => lacuna.criterio.id)).not.toContain('previsibilidadeDaCarga');
  });
});

describe('visaoESe — critério respondido como "não sei"', () => {
  const estado = coleta(
    respondeu('restricaoRegulatoria', 'nao'),
    naoSabe('previsibilidadeDaCarga'),
    respondeu('valorDeNegocio', 'alto'),
    respondeu('compatibilidadeDeBanco', 'sim'),
  );
  const visao = visaoESe(estado, 'previsibilidadeDaCarga');

  it('apresenta um cenário por valor possível do critério', () => {
    // Requisito 3.5.
    expect(visao.origem).toBe('respostaDesconhecida');
    expect(visao.cenarios.map((cenario) => cenario.valor.id)).toEqual(['estavel', 'variavel']);
    expect(visao.cenarios.map((cenario) => cenario.valor.rotulo)).toEqual(['estavel', 'variavel']);
  });

  it('mostra a estratégia que mudaria de faixa e a que não mudaria', () => {
    // Sem a informação, Retain fica em "possível" porque nenhuma regra se
    // aplicou; com carga estável, a regra de [Dalakas2025] a recomenda.
    expect(visao.recomendadasAtuais).toEqual(['refactor']);

    const estavel = visao.cenarios[0];
    expect(estavel.mudancasDeFaixa).toEqual([
      { estrategia: 'retain', de: 'possivel', para: 'recomendada' },
    ]);
    expect(estavel.alteraOResultado).toBe(true);
    // Empate de saldo mantém a ordem do cadastro das estratégias.
    expect(estavel.recomendadas).toEqual(['retain', 'refactor']);

    const variavel = visao.cenarios[1];
    expect(variavel.mudancasDeFaixa).toEqual([]);
    expect(variavel.alteraOResultado).toBe(false);
  });

  it('resume os valores que alteram o resultado e os que não alteram', () => {
    expect(visao.valoresQueAlteramOResultado).toEqual(['estavel']);
    expect(visao.valoresSemEfeito).toEqual(['variavel']);
    expect(visao.algumValorAlteraOResultado).toBe(true);
    expect(visao.declaracaoSemEfeito).toBeUndefined();
  });

  it('traz o resultado completo de cada cenário, com motivo e fonte', () => {
    // Requisitos 2.2 e 2.3: a mudança vem justificada, não apenas anunciada.
    const retain = visao.cenarios[0].resultado.recomendadas.find(
      (posicao) => posicao.estrategia === 'retain',
    );
    expect(retain?.regrasAFavor.map((regra) => regra.condicaoSatisfeita.descricao)).toEqual([
      'A carga é estável e previsível',
    ]);
    expect(retain?.regrasAFavor.flatMap((regra) => regra.estudosDeOrigem)).toEqual([
      '[Dalakas2025]',
    ]);
  });

  it('não altera a sessão do usuário', () => {
    // Requisito 3.5: o recálculo é hipotético.
    expect(estado.respostas).toHaveLength(4);
    expect(estado.respostas[1]).toEqual(naoSabe('previsibilidadeDaCarga'));
    expect(visao.resultadoAtual.criteriosDeclaradosDesconhecidos).toEqual([
      'previsibilidadeDaCarga',
    ]);
  });

  it('substitui a resposta desconhecida, e o cenário deixa de ser parcial por ela', () => {
    const cenario = visao.cenarios[0];
    // A lacuna desaparece no cenário: é o que se está assumindo saber.
    expect(cenario.resultado.criteriosDeclaradosDesconhecidos).toEqual([]);
    expect(cenario.resultado.ehParcial).toBe(false);
    // A resposta hipotética herda o momento da que ela substitui, em lugar de
    // introduzir um instante novo em um cálculo.
    expect(cenario.respostaHipotetica.momento).toBe(MOMENTO);
  });
});

describe('visaoESe — pergunta que não foi apresentada', () => {
  const estado = coleta(respondeu('restricaoRegulatoria', 'nao'));
  const visao = visaoESe(estado, 'valorDeNegocio');

  it('trata a lacuna da pergunta não apresentada como a do "não sei"', () => {
    // Requisito 3.5 vale para as duas origens.
    expect(visao.origem).toBe('perguntaNaoApresentada');
    expect(visao.cenarios.map((cenario) => cenario.valor.id)).toEqual(['alto', 'baixo']);
  });

  it('mostra as duas direções em que o resultado mudaria', () => {
    expect(visao.cenarios[0].mudancasDeFaixa).toEqual([
      { estrategia: 'refactor', de: 'possivel', para: 'recomendada' },
    ]);
    expect(visao.cenarios[1].mudancasDeFaixa).toEqual([
      { estrategia: 'refactor', de: 'possivel', para: 'naoRecomendada' },
    ]);
    expect(visao.valoresQueAlteramOResultado).toEqual(['alto', 'baixo']);
    expect(visao.valoresSemEfeito).toEqual([]);
  });
});

describe('visaoESe — valor que retira perguntas de circulação', () => {
  const estado = coleta(naoSabe('restricaoRegulatoria'), respondeu('compatibilidadeDeBanco', 'sim'));
  const visao = visaoESe(estado, 'restricaoRegulatoria');

  it('reconcilia as respostas que a sessão não teria colhido com esse valor', () => {
    // Seção 8.2 do design: o cenário equivale a uma sessão iniciada já com o
    // valor. Com componente regulado, Replatform é fixada e o Bloco F sai de
    // circulação, de modo que a resposta de PF1 perde o fundamento.
    const regulado = visao.cenarios[0];
    expect(regulado.valor.id).toBe('sim');
    expect(regulado.respostasInvalidadas).toEqual([respondeu('compatibilidadeDeBanco', 'sim')]);
    expect(
      regulado.resultado.naoRecomendadas.map((posicao) => posicao.estrategia),
    ).toEqual(['replatform']);
    expect(regulado.mudancasDeFaixa).toEqual([
      { estrategia: 'retain', de: 'possivel', para: 'recomendada' },
      { estrategia: 'replatform', de: 'possivel', para: 'naoRecomendada' },
    ]);
  });

  it('não invalida nada quando o valor mantém as perguntas em circulação', () => {
    const semRestricao = visao.cenarios[1];
    expect(semRestricao.valor.id).toBe('nao');
    expect(semRestricao.respostasInvalidadas).toEqual([]);
    expect(semRestricao.mudancasDeFaixa).toEqual([]);
  });
});

describe('visaoESe — critério cuja informação não muda nada', () => {
  it('declara que buscar a informação não altera o resultado', () => {
    // Seção 4.3 do design: é o que permite ao usuário decidir se vale a pena ir
    // buscar o dado. Com Replatform já fixada por precondição regulatória,
    // nenhum valor da verificação de banco move estratégia alguma.
    const estado = coleta(respondeu('restricaoRegulatoria', 'sim'));
    const visao = visaoESe(estado, 'compatibilidadeDeBanco');

    expect(visao.origem).toBe('foraDeCirculacao');
    expect(visao.cenarios).toHaveLength(2);
    expect(visao.cenarios.every((cenario) => cenario.mudancasDeFaixa.length === 0)).toBe(true);
    expect(visao.valoresSemEfeito).toEqual(['sim', 'nao']);
    expect(visao.algumValorAlteraOResultado).toBe(false);
    expect(visao.declaracaoSemEfeito).toBe(DECLARACAO_SEM_EFEITO);
  });
});

describe('visaoESe — recusas', () => {
  it('recusa critério inexistente', () => {
    expect(() => visaoESe(coleta(), 'criterioQueNaoExiste')).toThrow(ErroDeVisaoESe);
  });

  it('recusa critério com valor registrado, porque aí a operação é revisão', () => {
    // Requisito 1.5 trata a alteração de resposta conhecida; a visão "e se" é
    // do Requisito 3.5, para o que não se sabe.
    expect.assertions(2);
    try {
      visaoESe(coleta(respondeu('valorDeNegocio', 'alto')), 'valorDeNegocio');
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroDeVisaoESe);
      expect((erro as ErroDeVisaoESe).motivo).toBe('criterioComRespostaRegistrada');
    }
  });
});

describe('visoesESe', () => {
  it('cobre todos os critérios sem resposta da sessão', () => {
    const estado = coleta(respondeu('restricaoRegulatoria', 'nao'), naoSabe('valorDeNegocio'));
    expect(visoesESe(estado).map((visao) => visao.criterio)).toEqual([
      'valorDeNegocio',
      'previsibilidadeDaCarga',
      'compatibilidadeDeBanco',
    ]);
  });
});

describe('visaoESe sobre o conteúdo real', () => {
  const CONTEUDO_REAL = carregarConteudo();

  /** Valor escolhido em cada critério do conteúdo real; o resto vira "não sei". */
  const ESCOLHAS: Readonly<Record<Id, Id>> = {
    usoDaAplicacao: 'continuaEmUso',
    restricaoRegulatoria: 'semRestricaoRegulatoria',
    fimDeSuporte: 'semFimDeSuporte',
    previsibilidadeDaCarga: 'cargaVariavelOuSazonal',
    valorDeNegocio: 'valorDeNegocioAlto',
    qualidadeTecnica: 'qualidadeTecnicaBoa',
    tempoParaReengenharia: 'haTempoParaReengenharia',
    volumeDeCodigo: 'volumeDeCodigoPequeno',
    acoplamentoDeDependencias: 'semAcoplamentoForte',
    competenciaInternaEmNuvem: 'temCompetenciaInterna',
    aversaoAAprisionamento: 'semAversaoAAprisionamento',
    prioridadeDeRiscoFinanceiro: 'riscoFinanceiroNaoEhPrioridade',
    inovacaoComoPrioridade: 'inovacaoNaoEhPrioridade',
    compatibilidadeDeLinguagem: 'linguagemSuportada',
    compatibilidadeDeBanco: 'bancoComEquivalente',
    adaptacaoDeMiddleware: 'middlewareAdaptavel',
    bibliotecasSobRestricoesDaPlataforma: 'bibliotecasCompativeis',
  };

  /**
   * Conduz a sessão até o fim respondendo o valor escolhido de cada critério e
   * "não sei" no critério indicado — a lacuna que a visão "e se" vai explorar.
   */
  function sessaoCom(lacuna: Id): Resposta[] {
    const respostas: Resposta[] = [];
    for (let passo = 0; passo <= CONTEUDO_REAL.perguntas.length; passo += 1) {
      const pergunta = proximaPergunta({ conteudo: CONTEUDO_REAL, respostas });
      if (pergunta === undefined) break;
      const escolha = ESCOLHAS[pergunta.criterio];
      respostas.push(
        pergunta.criterio === lacuna || escolha === undefined
          ? naoSabe(pergunta.criterio)
          : respondeu(pergunta.criterio, escolha),
      );
    }
    return respostas;
  }

  it('mostra que descobrir o equivalente em SaaS decide a posição de Repurchase', () => {
    // As duas regras de [Khouibiri2024] sobre P12 apontam para Repurchase em
    // direções opostas: sem a resposta, nenhuma se aplica e a estratégia fica em
    // "possível"; cada valor a move para uma faixa diferente.
    const estado = { conteudo: CONTEUDO_REAL, respostas: sessaoCom('equivalenteEmSaaS') };
    const visao = visaoESe(estado, 'equivalenteEmSaaS');

    expect(visao.origem).toBe('respostaDesconhecida');
    expect(visao.resultadoAtual.ehParcial).toBe(true);
    expect(
      visao.resultadoAtual.possiveis.some((posicao) => posicao.estrategia === 'repurchase'),
    ).toBe(true);

    expect(visao.cenarios.map((cenario) => cenario.valor.id)).toEqual([
      'haEquivalenteEmSaaS',
      'semEquivalenteEmSaaS',
    ]);
    expect(visao.cenarios[0].mudancasDeFaixa).toEqual([
      { estrategia: 'repurchase', de: 'possivel', para: 'recomendada' },
    ]);
    expect(visao.cenarios[1].mudancasDeFaixa).toEqual([
      { estrategia: 'repurchase', de: 'possivel', para: 'naoRecomendada' },
    ]);
    expect(visao.algumValorAlteraOResultado).toBe(true);
  });

  it('oferece visão "e se" para cada critério sem resposta do resultado parcial', () => {
    const estado = { conteudo: CONTEUDO_REAL, respostas: sessaoCom('equivalenteEmSaaS') };
    const lacunas = lacunasDeInformacao(estado);

    expect(lacunas.map((lacuna) => lacuna.criterio.id)).toEqual(['equivalenteEmSaaS']);
    expect(visoesESe(estado)).toHaveLength(1);
  });
});
