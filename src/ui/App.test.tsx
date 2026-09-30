import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

/** Texto de P1, primeira pergunta do Bloco A no conteúdo vigente. */
const PRIMEIRA_PERGUNTA =
  'A aplicação continuará em uso ou já está prevista para desativação ou substituição?';

/** Texto de P4, primeira pergunta do Bloco B: a seguinte quando a aplicação continua em uso. */
const SEGUNDA_PERGUNTA =
  'Existe dado ou componente sob exigência regulatória que impeça sua execução fora do ambiente atual?';

function iniciarAvaliacao() {
  fireEvent.click(screen.getByRole('button', { name: /Iniciar a avaliação/i }));
}

function responder(rotulo: RegExp) {
  fireEvent.click(screen.getByLabelText(rotulo));
  fireEvent.click(screen.getByRole('button', { name: /Responder e continuar/i }));
}

function encerrarAgora() {
  fireEvent.click(screen.getByRole('button', { name: /Encerrar e ver o resultado parcial/i }));
}

/**
 * Responde "não sei" a todas as perguntas apresentadas, até a coleta encerrar.
 * O limite existe só para o teste falhar em lugar de rodar sem parar caso a
 * seleção passe a reapresentar pergunta.
 */
function responderTudoComNaoSei(limite = 40) {
  for (let volta = 0; volta < limite; volta += 1) {
    const confirmar = screen.queryByRole('button', { name: /Responder e continuar/i });
    if (confirmar === null) return;
    fireEvent.click(screen.getByLabelText(/^Não sei$/i));
    fireEvent.click(confirmar);
  }
  throw new Error('a coleta não encerrou dentro do limite de perguntas');
}

describe('App', () => {
  it('renderiza o título do Guia', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /Guia Prático de Suporte à Decisão/i }),
    ).toBeInTheDocument();
  });

  it('abre na tela de abertura, com as declarações de escopo (Requisito 4.1)', () => {
    render(<App />);

    expect(screen.getByRole('region', { name: /Antes de começar/i })).toBeInTheDocument();
    expect(screen.getByText(/menos de 250 funcionários/i)).toBeInTheDocument();
    expect(screen.queryByText(PRIMEIRA_PERGUNTA)).not.toBeInTheDocument();
  });

  it('ao iniciar, abre a sessão sobre o conteúdo vigente e apresenta a primeira pergunta do Bloco A (Requisitos 1.1 e 5.2)', () => {
    render(<App />);

    iniciarAvaliacao();

    expect(screen.getByText(PRIMEIRA_PERGUNTA)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Iniciar a avaliação/i })).not.toBeInTheDocument();
  });

  it('leva o foco ao título da coleta quando a abertura sai de cena', () => {
    render(<App />);

    iniciarAvaliacao();

    const titulo = screen.getByRole('heading', { name: /Coleta de respostas/i });
    expect(titulo).toHaveFocus();
  });

  it('apresenta uma pergunta por vez e avança para a seguinte ao registrar a resposta (Requisito 1.2)', () => {
    render(<App />);

    iniciarAvaliacao();
    expect(screen.queryByText(SEGUNDA_PERGUNTA)).not.toBeInTheDocument();

    responder(/Continua em uso/i);

    expect(screen.getByText(SEGUNDA_PERGUNTA)).toBeInTheDocument();
    expect(screen.queryByText(PRIMEIRA_PERGUNTA)).not.toBeInTheDocument();
  });

  it('avança também quando a resposta é "não sei" (Requisitos 3.1 e 3.2)', () => {
    render(<App />);

    iniciarAvaliacao();
    responder(/Não sei/i);

    expect(screen.getByText(SEGUNDA_PERGUNTA)).toBeInTheDocument();
  });

  it('leva o foco ao grupo da pergunta seguinte, e não de volta ao título da coleta', () => {
    render(<App />);

    iniciarAvaliacao();
    responder(/Continua em uso/i);

    expect(screen.getByRole('group', { name: SEGUNDA_PERGUNTA })).toHaveFocus();
  });

  it('encerra a coleta antes do fim e apresenta o resultado parcial (Requisito 3.4)', () => {
    render(<App />);

    iniciarAvaliacao();
    responder(/Continua em uso/i);
    encerrarAgora();

    expect(
      screen.getByRole('heading', { level: 2, name: /Resultado da avaliação/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: /Este resultado é parcial/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(SEGUNDA_PERGUNTA)).not.toBeInTheDocument();
  });

  it('volta às perguntas pendentes a partir do resultado parcial', () => {
    render(<App />);

    iniciarAvaliacao();
    responder(/Continua em uso/i);
    encerrarAgora();

    fireEvent.click(screen.getByRole('button', { name: /Voltar às perguntas pendentes/i }));

    expect(screen.getByText(SEGUNDA_PERGUNTA)).toBeInTheDocument();
  });

  it('altera uma resposta a partir do resultado e recalcula a sessão (Requisito 1.5)', () => {
    render(<App />);

    iniciarAvaliacao();
    responder(/Continua em uso/i);
    encerrarAgora();

    fireEvent.click(
      screen.getByRole('button', { name: /Alterar a resposta sobre Uso e destino da aplicação/i }),
    );

    // A pergunta volta, identificada como alteração de resposta já registrada.
    expect(screen.getByText(PRIMEIRA_PERGUNTA)).toBeInTheDocument();
    expect(screen.getByText(/Você está alterando a resposta sobre/i)).toBeInTheDocument();

    responder(/^Prevista para desativação ou substituição$/i);

    // De volta ao resultado, com o valor novo registrado.
    expect(
      screen.getByRole('heading', { level: 2, name: /Resultado da avaliação/i }),
    ).toBeInTheDocument();
    const respostas = within(screen.getByRole('region', { name: /Respostas registradas/i }));
    expect(
      respostas.getByText(/Uso e destino da aplicação: Prevista para desativação/i),
    ).toBeInTheDocument();
  });

  it('conduz a sessão até o fim e apresenta o resultado (Requisitos 1.4 e 2.1)', () => {
    render(<App />);

    iniciarAvaliacao();
    responderTudoComNaoSei();

    expect(
      screen.getByRole('heading', { level: 2, name: /Resultado da avaliação/i }),
    ).toBeInTheDocument();
    // "Não sei" em todas as perguntas: resultado parcial, nenhuma estratégia
    // descartada e a declaração de que a sessão não distinguiu alternativas
    // (Requisitos 3.4 e 2.6, Seção 8.2 do design).
    expect(
      screen.getByRole('region', { name: /Este resultado é parcial/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/não distinguiu alternativas/i)).toBeInTheDocument();
  });
});
