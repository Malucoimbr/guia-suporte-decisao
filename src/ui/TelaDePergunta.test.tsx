import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Criterio, Pergunta } from '../dominio/tipos';
import { TelaDePergunta } from './TelaDePergunta';

/**
 * O critério e a pergunta são montados aqui, e não lidos de `src/conteudo/`: a
 * tela precisa valer para qualquer catálogo, inclusive para critério de resposta
 * múltipla, que o conteúdo cadastrado hoje não tem. Os testes sobre o conteúdo
 * real ficam em `App.test.tsx`.
 */

const CRITERIO: Criterio = {
  id: 'previsibilidadeDaCarga',
  nome: 'Previsibilidade da carga',
  descricao: 'Como a carga se comporta ao longo do ano.',
  permiteRespostaMultipla: false,
  valores: [
    { id: 'estavel', criterio: 'previsibilidadeDaCarga', rotulo: 'Estável e previsível' },
    { id: 'variavel', criterio: 'previsibilidadeDaCarga', rotulo: 'Variável ou sazonal' },
  ],
};

const PERGUNTA: Pergunta = {
  id: 'P6',
  texto: 'Como se comporta a carga da aplicação ao longo do ano?',
  criterio: CRITERIO.id,
  bloco: 'B',
  ordem: 3,
  estrategiasAfetadas: ['retain', 'rehost', 'replatform'],
  fontes: ['[Dalakas2025]'],
};

/** O mesmo critério, admitindo mais de um valor na mesma resposta. */
const CRITERIO_MULTIPLO: Criterio = { ...CRITERIO, permiteRespostaMultipla: true };

function confirmar() {
  fireEvent.click(screen.getByRole('button', { name: /Responder e continuar/i }));
}

describe('TelaDePergunta', () => {
  it('apresenta os valores cadastrados do critério e sempre a opção "não sei" (Requisitos 1.1 e 3.1)', () => {
    render(
      <TelaDePergunta pergunta={PERGUNTA} criterio={CRITERIO} onResponder={() => {}} />,
    );

    expect(screen.getByLabelText('Estável e previsível')).toBeInTheDocument();
    expect(screen.getByLabelText('Variável ou sazonal')).toBeInTheDocument();
    expect(screen.getByLabelText('Não sei')).toBeInTheDocument();
    // Os dois valores cadastrados mais "não sei", que não vem do conteúdo.
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('rotula o grupo de opções pelo texto da pergunta', () => {
    render(
      <TelaDePergunta pergunta={PERGUNTA} criterio={CRITERIO} onResponder={() => {}} />,
    );

    expect(screen.getByRole('group', { name: PERGUNTA.texto })).toBeInTheDocument();
  });

  it('devolve o valor escolhido ao confirmar (Requisito 1.2)', () => {
    const onResponder = vi.fn();
    render(
      <TelaDePergunta pergunta={PERGUNTA} criterio={CRITERIO} onResponder={onResponder} />,
    );

    fireEvent.click(screen.getByLabelText('Estável e previsível'));
    confirmar();

    expect(onResponder).toHaveBeenCalledWith({ tipo: 'valores', valores: ['estavel'] });
  });

  it('devolve resposta desconhecida sem pedir justificativa nem estimativa (Requisitos 3.1 e 3.2)', () => {
    const onResponder = vi.fn();
    render(
      <TelaDePergunta pergunta={PERGUNTA} criterio={CRITERIO} onResponder={onResponder} />,
    );

    fireEvent.click(screen.getByLabelText('Não sei'));
    // Nada é pedido em troca: não há campo de texto na tela.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    confirmar();

    expect(onResponder).toHaveBeenCalledWith({ tipo: 'desconhecida' });
  });

  it('não confirma sem escolha: ausência de resposta não é "não sei"', () => {
    const onResponder = vi.fn();
    render(
      <TelaDePergunta pergunta={PERGUNTA} criterio={CRITERIO} onResponder={onResponder} />,
    );

    expect(screen.getByRole('button', { name: /Responder e continuar/i })).toBeDisabled();
    confirmar();

    expect(onResponder).not.toHaveBeenCalled();
  });

  it('usa caixas de seleção e aceita mais de um valor quando o critério admite resposta múltipla', () => {
    const onResponder = vi.fn();
    render(
      <TelaDePergunta
        pergunta={PERGUNTA}
        criterio={CRITERIO_MULTIPLO}
        onResponder={onResponder}
      />,
    );

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Estável e previsível'));
    fireEvent.click(screen.getByLabelText('Variável ou sazonal'));
    confirmar();

    expect(onResponder).toHaveBeenCalledWith({
      tipo: 'valores',
      valores: ['estavel', 'variavel'],
    });
  });

  it('trata "não sei" como exclusivo mesmo em critério de resposta múltipla', () => {
    const onResponder = vi.fn();
    render(
      <TelaDePergunta
        pergunta={PERGUNTA}
        criterio={CRITERIO_MULTIPLO}
        onResponder={onResponder}
      />,
    );

    fireEvent.click(screen.getByLabelText('Estável e previsível'));
    fireEvent.click(screen.getByLabelText('Não sei'));

    expect(screen.getByLabelText('Estável e previsível')).not.toBeChecked();
    confirmar();

    expect(onResponder).toHaveBeenCalledWith({ tipo: 'desconhecida' });
  });

  it('na troca de pergunta, limpa a escolha anterior e leva o foco ao grupo', () => {
    const outroCriterio: Criterio = {
      id: 'volumeDeCodigo',
      nome: 'Volume de código',
      descricao: 'Tamanho da base de código a migrar.',
      permiteRespostaMultipla: false,
      valores: [
        { id: 'grande', criterio: 'volumeDeCodigo', rotulo: 'Grande' },
        { id: 'pequena', criterio: 'volumeDeCodigo', rotulo: 'Pequena' },
      ],
    };
    const outraPergunta: Pergunta = {
      id: 'P8',
      texto: 'Qual o tamanho da base de código a migrar?',
      criterio: outroCriterio.id,
      bloco: 'D',
      ordem: 2,
      estrategiasAfetadas: ['refactor'],
      fontes: ['[Fonseca2024]'],
    };

    const { rerender } = render(
      <TelaDePergunta pergunta={PERGUNTA} criterio={CRITERIO} onResponder={() => {}} />,
    );
    fireEvent.click(screen.getByLabelText('Estável e previsível'));

    rerender(
      <TelaDePergunta
        pergunta={outraPergunta}
        criterio={outroCriterio}
        onResponder={() => {}}
      />,
    );

    const grupo = screen.getByRole('group', { name: outraPergunta.texto });
    expect(grupo).toHaveFocus();
    expect(screen.getByLabelText('Grande')).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Responder e continuar/i })).toBeDisabled();
  });
});
