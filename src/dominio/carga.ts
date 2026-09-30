/**
 * Carga do conteúdo editável a partir dos arquivos JSON de `src/conteudo/`
 * (Seção 2.1 do design; Requisitos 5.1 e 5.2).
 *
 * O conteúdo decisório é dado, não código: critérios, perguntas, estratégias,
 * regras e estudos vivem em JSON versionado, e este módulo é o único ponto que
 * os transforma em um objeto {@link Conteudo} tipado. Acrescentar uma regra é
 * acrescentar uma linha de JSON — nada aqui muda.
 *
 * `carregarConteudo` é chamada no início da sessão. Cada chamada interpreta os
 * arquivos de novo e devolve estruturas próprias, de modo que a alteração de
 * conteúdo vale para as sessões iniciadas depois (Requisito 5.2) e uma sessão
 * não enxerga o estado de outra.
 *
 * O que se verifica aqui é apenas a **forma** de cada item — campo obrigatório
 * presente, tipo correto, opção dentro do conjunto admitido. A coerência entre
 * arquivos (regra que aponta para estudo cadastrado, condição que usa valor
 * cadastrado, marcações obrigatórias) é a verificação de consistência do
 * conteúdo, tratada à parte.
 */
import criteriosJson from '../conteudo/criterios.json';
import perguntasJson from '../conteudo/perguntas.json';
import estrategiasJson from '../conteudo/estrategias.json';
import regrasJson from '../conteudo/regras.json';
import estudosJson from '../conteudo/estudos.json';
import avisosJson from '../conteudo/avisos.json';
import type {
  AvisoDeEncerramento,
  Bloco,
  Condicao,
  CondicaoDeExibicao,
  Conteudo,
  Criterio,
  DirecaoDeEfeito,
  Estrategia,
  Estudo,
  Id,
  IdEstudo,
  ItemDeAviso,
  ListaDeAviso,
  ParCriterioValor,
  Pergunta,
  Regra,
  TipoDeEfeito,
  ValorDeResposta,
} from './tipos';

/** Conteúdo como sai dos arquivos JSON, antes de ser interpretado. */
export interface ConteudoBruto {
  criterios: unknown;
  perguntas: unknown;
  estrategias: unknown;
  regras: unknown;
  estudos: unknown;
  /**
   * Listas dos avisos de encerramento. Opcional porque não participa da
   * inferência: conteúdo montado para exercitar o motor de regras não precisa
   * declará-la, e a ausência produz lista vazia.
   */
  listasDeAviso?: unknown;
}

/**
 * Falha de forma no conteúdo. Reúne todos os problemas encontrados em vez de
 * parar no primeiro, para que a pesquisadora corrija o JSON de uma só vez.
 */
export class ErroDeCargaDeConteudo extends Error {
  readonly problemas: readonly string[];

  constructor(problemas: readonly string[]) {
    super(
      `Conteúdo inválido em src/conteudo (${problemas.length} ${
        problemas.length === 1 ? 'problema' : 'problemas'
      }):\n- ${problemas.join('\n- ')}`,
    );
    this.name = 'ErroDeCargaDeConteudo';
    this.problemas = problemas;
  }
}

const BLOCOS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const TIPOS_DE_EFEITO = ['precondicao', 'contribuicao'] as const;
const DIRECOES = ['favor', 'contra'] as const;
const AVISOS = ['apoioADecisao', 'semPlanoDeExecucao', 'semEstimativaDeCusto'] as const;

type Problemas = string[];

// ---------------------------------------------------------------------------
// Leitores de campo
// ---------------------------------------------------------------------------

type Objeto = Record<string, unknown>;

function ehObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function lerLista(valor: unknown, caminho: string, problemas: Problemas): unknown[] {
  if (!Array.isArray(valor)) {
    problemas.push(`${caminho} deveria ser uma lista`);
    return [];
  }
  return valor;
}

function lerTexto(item: Objeto, campo: string, caminho: string, problemas: Problemas): string {
  const valor = item[campo];
  if (typeof valor !== 'string' || valor.trim() === '') {
    problemas.push(`${caminho}.${campo} deveria ser texto não vazio`);
    return '';
  }
  return valor;
}

function lerTextoOuNulo(
  item: Objeto,
  campo: string,
  caminho: string,
  problemas: Problemas,
): string | null {
  const valor = item[campo];
  if (valor === null) return null;
  if (typeof valor !== 'string' || valor.trim() === '') {
    problemas.push(`${caminho}.${campo} deveria ser texto não vazio ou nulo`);
    return null;
  }
  return valor;
}

function lerBooleano(item: Objeto, campo: string, caminho: string, problemas: Problemas): boolean {
  const valor = item[campo];
  if (typeof valor !== 'boolean') {
    problemas.push(`${caminho}.${campo} deveria ser verdadeiro ou falso`);
    return false;
  }
  return valor;
}

function lerNumero(item: Objeto, campo: string, caminho: string, problemas: Problemas): number {
  const valor = item[campo];
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    problemas.push(`${caminho}.${campo} deveria ser número`);
    return 0;
  }
  return valor;
}

function lerListaDeTexto(
  item: Objeto,
  campo: string,
  caminho: string,
  problemas: Problemas,
): string[] {
  const bruta = lerLista(item[campo], `${caminho}.${campo}`, problemas);
  const lista: string[] = [];
  bruta.forEach((valor, indice) => {
    if (typeof valor !== 'string' || valor.trim() === '') {
      problemas.push(`${caminho}.${campo}[${indice}] deveria ser texto não vazio`);
      return;
    }
    lista.push(valor);
  });
  return lista;
}

function lerOpcao<T extends string>(
  item: Objeto,
  campo: string,
  opcoes: readonly T[],
  caminho: string,
  problemas: Problemas,
): T {
  const valor = item[campo];
  if (typeof valor !== 'string' || !(opcoes as readonly string[]).includes(valor)) {
    problemas.push(`${caminho}.${campo} deveria ser um de: ${opcoes.join(', ')}`);
    return opcoes[0];
  }
  return valor as T;
}

/**
 * Interpreta cada item de uma lista de JSON. Item que não é objeto é reportado
 * e descartado — os problemas acumulados impedem a carga de concluir.
 */
function lerItens<T>(
  bruta: unknown,
  arquivo: string,
  problemas: Problemas,
  leitor: (item: Objeto, caminho: string, problemas: Problemas) => T,
): T[] {
  const lista = lerLista(bruta, arquivo, problemas);
  const itens: T[] = [];
  lista.forEach((item, indice) => {
    const caminho = `${arquivo}[${indice}]`;
    if (!ehObjeto(item)) {
      problemas.push(`${caminho} deveria ser um objeto`);
      return;
    }
    itens.push(leitor(item, caminho, problemas));
  });
  return itens;
}

// ---------------------------------------------------------------------------
// Leitores de entidade
// ---------------------------------------------------------------------------

function lerValorDeResposta(item: Objeto, caminho: string, problemas: Problemas): ValorDeResposta {
  return {
    id: lerTexto(item, 'id', caminho, problemas),
    criterio: lerTexto(item, 'criterio', caminho, problemas),
    rotulo: lerTexto(item, 'rotulo', caminho, problemas),
  };
}

function lerCriterio(item: Objeto, caminho: string, problemas: Problemas): Criterio {
  return {
    id: lerTexto(item, 'id', caminho, problemas),
    nome: lerTexto(item, 'nome', caminho, problemas),
    descricao: lerTexto(item, 'descricao', caminho, problemas),
    valores: lerItens(item.valores, `${caminho}.valores`, problemas, lerValorDeResposta),
    permiteRespostaMultipla: lerBooleano(item, 'permiteRespostaMultipla', caminho, problemas),
  };
}

function lerParCriterioValor(
  item: Objeto,
  caminho: string,
  problemas: Problemas,
): ParCriterioValor {
  return {
    criterio: lerTexto(item, 'criterio', caminho, problemas),
    valor: lerTexto(item, 'valor', caminho, problemas),
  };
}

function lerCondicao(bruta: unknown, caminho: string, problemas: Problemas): Condicao {
  if (!ehObjeto(bruta)) {
    problemas.push(`${caminho} deveria ser um objeto`);
    return { pares: [], descricao: '' };
  }
  return {
    pares: lerItens(bruta.pares, `${caminho}.pares`, problemas, lerParCriterioValor),
    descricao: lerTexto(bruta, 'descricao', caminho, problemas),
  };
}

/**
 * Condição de exibição, sempre opcional: pergunta sem condição é aplicável
 * desde o início. As duas partes também são opcionais — a expressão sobre
 * respostas já registradas e a exigência de estratégias ainda em jogo, que é o
 * que sustenta o Bloco F (Seção 4.2 do design).
 */
function lerCondicaoDeExibicao(
  bruta: unknown,
  caminho: string,
  problemas: Problemas,
): CondicaoDeExibicao | undefined {
  if (bruta === undefined || bruta === null) return undefined;
  if (!ehObjeto(bruta)) {
    problemas.push(`${caminho} deveria ser um objeto`);
    return undefined;
  }

  const condicao: CondicaoDeExibicao = {};
  if (bruta.respostas !== undefined && bruta.respostas !== null) {
    condicao.respostas = lerCondicao(bruta.respostas, `${caminho}.respostas`, problemas);
  }
  if (bruta.estrategiasEmJogo !== undefined && bruta.estrategiasEmJogo !== null) {
    condicao.estrategiasEmJogo = lerListaDeTexto(
      bruta,
      'estrategiasEmJogo',
      caminho,
      problemas,
    ) as Id[];
  }
  return condicao;
}

function lerPergunta(item: Objeto, caminho: string, problemas: Problemas): Pergunta {
  const pergunta: Pergunta = {
    id: lerTexto(item, 'id', caminho, problemas),
    texto: lerTexto(item, 'texto', caminho, problemas),
    criterio: lerTexto(item, 'criterio', caminho, problemas),
    bloco: lerOpcao<Bloco>(item, 'bloco', BLOCOS, caminho, problemas),
    ordem: lerNumero(item, 'ordem', caminho, problemas),
    estrategiasAfetadas: lerListaDeTexto(item, 'estrategiasAfetadas', caminho, problemas),
    fontes: lerListaDeTexto(item, 'fontes', caminho, problemas) as IdEstudo[],
  };

  const condicaoDeExibicao = lerCondicaoDeExibicao(
    item.condicaoDeExibicao,
    `${caminho}.condicaoDeExibicao`,
    problemas,
  );
  if (condicaoDeExibicao !== undefined) {
    pergunta.condicaoDeExibicao = condicaoDeExibicao;
  }
  return pergunta;
}

function lerEstrategia(item: Objeto, caminho: string, problemas: Problemas): Estrategia {
  return {
    id: lerTexto(item, 'id', caminho, problemas),
    nome: lerTexto(item, 'nome', caminho, problemas),
    descricao: lerTexto(item, 'descricao', caminho, problemas),
    temCaracterizacaoNoCorpus: lerBooleano(item, 'temCaracterizacaoNoCorpus', caminho, problemas),
  };
}

function lerRegra(item: Objeto, caminho: string, problemas: Problemas): Regra {
  return {
    id: lerTexto(item, 'id', caminho, problemas),
    condicao: lerCondicao(item.condicao, `${caminho}.condicao`, problemas),
    estrategiaAlvo: lerTexto(item, 'estrategiaAlvo', caminho, problemas),
    tipoDeEfeito: lerOpcao<TipoDeEfeito>(
      item,
      'tipoDeEfeito',
      TIPOS_DE_EFEITO,
      caminho,
      problemas,
    ),
    direcao: lerOpcao<DirecaoDeEfeito>(item, 'direcao', DIRECOES, caminho, problemas),
    textoMotivo: lerTexto(item, 'textoMotivo', caminho, problemas),
    estudosDeOrigem: lerListaDeTexto(item, 'estudosDeOrigem', caminho, problemas) as IdEstudo[],
    ehInterpretacao: lerBooleano(item, 'ehInterpretacao', caminho, problemas),
    evidenciaApenasDePorteGrande: lerBooleano(
      item,
      'evidenciaApenasDePorteGrande',
      caminho,
      problemas,
    ),
  };
}

/**
 * Item de lista de aviso. `estrategias` é lista obrigatória, e vazia é valor
 * legítimo: significa item que não depende da estratégia escolhida e por isso
 * aparece em toda sessão (Seção 5.6 do design).
 */
function lerItemDeAviso(item: Objeto, caminho: string, problemas: Problemas): ItemDeAviso {
  return {
    id: lerTexto(item, 'id', caminho, problemas),
    texto: lerTexto(item, 'texto', caminho, problemas),
    estudosDeOrigem: lerListaDeTexto(item, 'estudosDeOrigem', caminho, problemas) as IdEstudo[],
    estrategias: lerListaDeTexto(item, 'estrategias', caminho, problemas) as Id[],
  };
}

function lerListaDeAviso(item: Objeto, caminho: string, problemas: Problemas): ListaDeAviso {
  return {
    id: lerTexto(item, 'id', caminho, problemas),
    aviso: lerOpcao<AvisoDeEncerramento>(item, 'aviso', AVISOS, caminho, problemas),
    titulo: lerTexto(item, 'titulo', caminho, problemas),
    descricao: lerTexto(item, 'descricao', caminho, problemas),
    itens: lerItens(item.itens, `${caminho}.itens`, problemas, lerItemDeAviso),
  };
}

function lerEstudo(item: Objeto, caminho: string, problemas: Problemas): Estudo {
  return {
    id: lerTexto(item, 'id', caminho, problemas),
    referencia: lerTexto(item, 'referencia', caminho, problemas),
    arquivoNoAcervo: lerTextoOuNulo(item, 'arquivoNoAcervo', caminho, problemas),
    contextoEmpirico: lerTexto(item, 'contextoEmpirico', caminho, problemas),
    porteAnalisado: lerTexto(item, 'porteAnalisado', caminho, problemas),
  };
}

// ---------------------------------------------------------------------------
// Interpretação e carga
// ---------------------------------------------------------------------------

/**
 * Transforma o conteúdo bruto em {@link Conteudo} tipado.
 *
 * Separada de {@link carregarConteudo} para que a mesma interpretação possa ser
 * exercitada sobre conteúdo qualquer, e não só sobre os arquivos do
 * repositório.
 *
 * @throws {ErroDeCargaDeConteudo} quando algum item não tem a forma esperada.
 */
export function interpretarConteudo(bruto: ConteudoBruto): Conteudo {
  const problemas: Problemas = [];

  const conteudo: Conteudo = {
    criterios: lerItens(bruto.criterios, 'criterios.json', problemas, lerCriterio),
    perguntas: lerItens(bruto.perguntas, 'perguntas.json', problemas, lerPergunta),
    estrategias: lerItens(bruto.estrategias, 'estrategias.json', problemas, lerEstrategia),
    regras: lerItens(bruto.regras, 'regras.json', problemas, lerRegra),
    estudos: lerItens(bruto.estudos, 'estudos.json', problemas, lerEstudo),
    listasDeAviso:
      bruto.listasDeAviso === undefined || bruto.listasDeAviso === null
        ? []
        : lerItens(bruto.listasDeAviso, 'avisos.json', problemas, lerListaDeAviso),
  };

  if (problemas.length > 0) {
    throw new ErroDeCargaDeConteudo(problemas);
  }
  return conteudo;
}

/**
 * Lê os arquivos JSON de `src/conteudo/` e devolve o conteúdo vigente.
 *
 * Chamada no início da sessão. Cada chamada produz estruturas novas, de modo
 * que a sessão trabalha sobre o conteúdo lido na sua abertura e alterações
 * posteriores só alcançam as sessões iniciadas depois (Requisito 5.2).
 *
 * @throws {ErroDeCargaDeConteudo} quando algum item não tem a forma esperada.
 */
export function carregarConteudo(): Conteudo {
  return interpretarConteudo({
    criterios: criteriosJson,
    perguntas: perguntasJson,
    estrategias: estrategiasJson,
    regras: regrasJson,
    estudos: estudosJson,
    listasDeAviso: avisosJson,
  });
}
