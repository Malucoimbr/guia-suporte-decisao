import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Abertura } from './Abertura';

describe('Abertura', () => {
  it('declara público-alvo, definição de PME e conteúdo provisório (Requisito 4.1)', () => {
    render(<Abertura onIniciar={() => {}} />);

    expect(
      screen.getByRole('heading', { name: /A quem o Guia se destina/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/gestores de TI/i)).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: /Definição de PME adotada/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/menos de 250 funcionários/i)).toBeInTheDocument();
    expect(screen.getByText(/\[RoyPatil2023\]/)).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: /conteúdo decisório é provisório/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/revisão da literatura em andamento/i)).toBeInTheDocument();
  });

  it('rotula a região pelo próprio título e mantém os níveis em ordem', () => {
    render(<Abertura onIniciar={() => {}} />);

    const regiao = screen.getByRole('region', { name: /Antes de começar/i });
    expect(regiao).toBeInTheDocument();
    expect(regiao.querySelector('h2')).toHaveTextContent('Antes de começar');
    // As três declarações são subseções: h3 sob o h2, sem salto de nível.
    expect(regiao.querySelectorAll('h3')).toHaveLength(3);
  });

  it('aciona o início da sessão pelo botão', async () => {
    const onIniciar = vi.fn();
    render(<Abertura onIniciar={onIniciar} />);

    const botao = screen.getByRole('button', { name: /Iniciar a avaliação/i });
    botao.click();

    expect(onIniciar).toHaveBeenCalledTimes(1);
  });
});
