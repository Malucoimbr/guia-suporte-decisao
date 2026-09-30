import { describe, expect, it } from 'vitest';
import { carregarConteudo } from '../dominio/carga';
import { descreverDivergencia, verificarConsistencia } from '../dominio/consistencia';

/**
 * Conferência do conteúdo do repositório (Tarefa 3.6; Requisitos 5.1 e 5.3).
 *
 * `consistencia.test.ts` exercita o mecanismo sobre conteúdo montado à mão.
 * Aqui o alvo é o outro: os JSON de `src/conteudo/` como estão versionados. É o
 * teste que a evolução do conteúdo prevista na Seção 7 do design tem de manter
 * verde — acrescentar regra que aponta estudo não cadastrado, ou pergunta sobre
 * critério que nenhuma regra usa, quebra aqui e não em silêncio na sessão.
 *
 * A mensagem de falha lista as divergências para que quem editou o JSON leia
 * direto o que saiu do lugar.
 */

describe('conteúdo cadastrado em src/conteudo', () => {
  it('tem a forma esperada e carrega sem erro', () => {
    expect(() => carregarConteudo()).not.toThrow();
  });

  it('não tem divergência de consistência', () => {
    const divergencias = verificarConsistencia(carregarConteudo());

    expect(
      divergencias.map(descreverDivergencia),
      'o conteúdo de src/conteudo está incoerente; corrija o JSON',
    ).toEqual([]);
  });

  it('cadastra as sete estratégias dos 7Rs', () => {
    expect(carregarConteudo().estrategias).toHaveLength(7);
  });

  it('cadastra as listas que os avisos de encerramento exigem (Requisitos 4.3 e 4.4)', () => {
    const listas = carregarConteudo().listasDeAviso ?? [];

    // 4.3 pede os fatores de sucesso e de fracasso do processo; 4.4, os
    // condutores de custo e os custos ocultos das estratégias recomendadas.
    expect(listas.map((lista) => lista.id)).toEqual([
      'fatoresDeSucesso',
      'fatoresDeFracasso',
      'condutoresDeCusto',
      'custosOcultos',
    ]);
    expect(
      listas.filter((lista) => lista.aviso === 'semPlanoDeExecucao'),
    ).toHaveLength(2);
    expect(
      listas.filter((lista) => lista.aviso === 'semEstimativaDeCusto'),
    ).toHaveLength(2);
    // Todo item cita o estudo que o registra: fator ou custo sem fonte não
    // atende ao Requisito 2.3 nem ao 5.3.
    for (const lista of listas) {
      expect(lista.itens.length).toBeGreaterThan(0);
      for (const item of lista.itens) {
        expect(item.estudosDeOrigem.length, `${lista.id}/${item.id}`).toBeGreaterThan(0);
      }
    }
  });
});
