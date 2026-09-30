/**
 * Testes de interface de ponta a ponta sobre o conteúdo real (tarefa 7.5;
 * Requisitos 3.1, 4.1, 4.2, 4.3 e 4.4).
 *
 * Os testes por componente — `Abertura`, `TelaDePergunta`, `AvisosDeEncerramento`
 * — verificam cada tela isoladamente, com conteúdo montado à mão. O que falta, e
 * é o que esta suíte faz, é verificar as três exigências que só se cumprem
 * quando a aplicação inteira roda contra o catálogo cadastrado:
 *
 * - as declarações de abertura aparecem **antes de qualquer pergunta**
 *   (Requisito 4.1): não basta a tela existir, ela tem de ser o que o usuário lê
 *   primeiro;
 * - a opção «não sei» está presente em **toda pergunta do catálogo real**
 *   (Requisito 3.1), e não apenas na pergunta que um teste de componente
 *   escolheu. Por isso a sessão é percorrida do início ao fim e a asserção é
 *   feita em cada pergunta apresentada;
 * - os três avisos de encerramento aparecem no resultado em **qualquer caminho**
 *   de sessão (Requisitos 4.2 a 4.4), inclusive quando nenhuma estratégia é
 *   recomendada — o caminho em que as listas ficam recortadas e teria sido mais
 *   fácil sumir com a seção inteira.
 *
 * O conteúdo aqui é o vigente, lido por `carregarConteudo`, e é dele que sai a
 * lista de perguntas esperada: a suíte acompanha o avanço da Rapid Review sem
 * ter texto de pergunta escrito no teste.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { carregarConteudo } from '../dominio/carga';
import { App } from './App';

/** Catálogo vigente, fonte das perguntas que a sessão deve apresentar. */
const CONTEUDO = carregarConteudo();

/** Texto de cada pergunta cadastrada, na ordem do arquivo de conteúdo. */
const TEXTOS_DAS_PERGUNTAS = CONTEUDO.perguntas.map((pergunta) => pergunta.texto);

/**
 * Limite de voltas do percurso. Existe para o teste falhar com mensagem em lugar
 * de rodar sem parar caso a seleção passe a reapresentar pergunta.
 */
const LIMITE_DE_PERGUNTAS = 40;

function iniciarAvaliacao() {
  fireEvent.click(screen.getByRole('button', { name: /Iniciar a avaliação/i }));
}

/** A pergunta em exibição, pelo texto da legenda do grupo de opções. */
function textoDaPerguntaEmExibicao(): string {
  const grupo = screen.getByRole('group');
  const legenda = grupo.querySelector('legend');
  if (legenda === null) throw new Error('a pergunta em exibição não tem legenda');
  return legenda.textContent ?? '';
}

/**
 * Percorre a sessão respondendo «não sei» e devolve o texto de cada pergunta
 * apresentada, na ordem.
 *
 * A asserção do Requisito 3.1 é feita aqui, dentro do laço: cada pergunta
 * apresentada tem de oferecer a opção, e a opção tem de ser um controle de
 * resposta — não um texto explicativo com a mesma palavra.
 */
function percorrerRespondendoNaoSei(): string[] {
  const apresentadas: string[] = [];

  for (let volta = 0; volta < LIMITE_DE_PERGUNTAS; volta += 1) {
    const confirmar = screen.queryByRole('button', { name: /Responder e continuar/i });
    if (confirmar === null) return apresentadas;

    const texto = textoDaPerguntaEmExibicao();
    apresentadas.push(texto);

    const grupo = screen.getByRole('group');
    const naoSei = within(grupo).getByLabelText(/^Não sei$/);
    expect(naoSei, `a pergunta «${texto}» não oferece «não sei»`).toBeInstanceOf(
      HTMLInputElement,
    );

    fireEvent.click(naoSei);
    fireEvent.click(confirmar);
  }

  throw new Error('a coleta não encerrou dentro do limite de perguntas');
}

/** A seção dos três avisos de encerramento. */
function avisos() {
  return within(screen.getByRole('region', { name: /Limites deste resultado/i }));
}

describe('interface, de ponta a ponta sobre o conteúdo real', () => {
  it('apresenta as três declarações de abertura antes de qualquer pergunta (Requisito 4.1)', () => {
    render(<App />);

    const abertura = within(screen.getByRole('region', { name: /Antes de começar/i }));
    // Público-alvo, definição de PME adotada e a provisoriedade do conteúdo
    // decisório, nesta ordem de leitura.
    expect(
      abertura.getByRole('heading', { name: /A quem o Guia se destina/i }),
    ).toBeInTheDocument();
    expect(
      abertura.getByRole('heading', { name: /Definição de PME adotada/i }),
    ).toBeInTheDocument();
    expect(abertura.getByText(/menos de 250 funcionários/i)).toBeInTheDocument();
    expect(
      abertura.getByRole('heading', { name: /O conteúdo decisório é provisório/i }),
    ).toBeInTheDocument();
    expect(abertura.getByText(/revisão da literatura em\s+andamento/i)).toBeInTheDocument();

    // Nenhuma pergunta do catálogo está em cena, e não há o que responder.
    for (const texto of TEXTOS_DAS_PERGUNTAS) {
      expect(screen.queryByText(texto)).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole('button', { name: /Responder e continuar/i }),
    ).not.toBeInTheDocument();
  });

  it('oferece «não sei» em toda pergunta do catálogo, percorrendo a sessão inteira (Requisito 3.1)', () => {
    render(<App />);

    iniciarAvaliacao();
    const apresentadas = percorrerRespondendoNaoSei();

    // Toda pergunta cadastrada foi apresentada — «não sei» não fixa estratégia,
    // então nenhuma pergunta sai de circulação por este caminho — e nenhuma
    // apareceu duas vezes.
    expect([...apresentadas].sort()).toEqual([...TEXTOS_DAS_PERGUNTAS].sort());
    expect(new Set(apresentadas).size).toBe(apresentadas.length);
  });

  it('apresenta os três avisos de encerramento quando nenhuma estratégia é recomendada (Requisitos 4.2 a 4.4)', () => {
    render(<App />);

    iniciarAvaliacao();
    percorrerRespondendoNaoSei();

    expect(
      screen.getByRole('heading', { level: 2, name: /Resultado da avaliação/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhuma estratégia foi recomendada com as respostas registradas/i),
    ).toBeInTheDocument();

    // Os três avisos aparecem mesmo sem estratégia recomendada, e as listas
    // declaram o recorte em lugar de sumir sem explicação.
    expect(avisos().getAllByRole('heading', { level: 4 })).toHaveLength(3);
    expect(avisos().getByText(/não substituem avaliação especializada/i)).toBeInTheDocument();
    expect(
      avisos().getByRole('heading', { level: 4, name: /não é plano de execução/i }),
    ).toBeInTheDocument();
    expect(
      avisos().getByRole('heading', {
        level: 4,
        name: /não contém estimativa de custo monetário/i,
      }),
    ).toBeInTheDocument();
    expect(
      avisos().getAllByText(/Nenhuma estratégia foi recomendada nesta sessão/i).length,
    ).toBeGreaterThan(0);
  });

  it('apresenta os três avisos de encerramento também quando há estratégia recomendada (Requisitos 4.2 a 4.4)', () => {
    render(<App />);

    iniciarAvaliacao();
    // Aplicação prevista para desativação: caminho que produz recomendação, ao
    // contrário do percurso todo «não sei».
    fireEvent.click(screen.getByLabelText(/^Prevista para desativação ou substituição$/i));
    fireEvent.click(screen.getByRole('button', { name: /Responder e continuar/i }));
    percorrerRespondendoNaoSei();

    const recomendadas = within(
      screen.getByRole('region', { name: /Estratégias recomendadas/i }),
    );
    expect(recomendadas.getByRole('heading', { level: 4, name: /Retire/i })).toBeInTheDocument();

    expect(avisos().getAllByRole('heading', { level: 4 })).toHaveLength(3);
    expect(avisos().getByText(/não substituem avaliação especializada/i)).toBeInTheDocument();
    expect(
      avisos().getByRole('heading', { level: 4, name: /não é plano de execução/i }),
    ).toBeInTheDocument();
    expect(
      avisos().getByRole('heading', {
        level: 4,
        name: /não contém estimativa de custo monetário/i,
      }),
    ).toBeInTheDocument();
    // O recorte das listas cita a estratégia recomendada nesta sessão.
    expect(
      avisos().getAllByText(/se aplicam ao que foi recomendado nesta sessão: Retire/i).length,
    ).toBeGreaterThan(0);
  });
});
