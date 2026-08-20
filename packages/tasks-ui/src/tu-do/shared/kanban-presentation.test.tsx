import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanPresentation } from './kanban-presentation';

describe('KanbanPresentation', () => {
  afterEach(() => vi.useRealTimers());

  it('shows one skeleton until the finalized layout is ready', () => {
    const { rerender } = render(
      <KanbanPresentation
        boardId="board-1"
        currentView="kanban"
        header={<div data-testid="board-header" />}
        initialLayoutReady={false}
      >
        <div data-testid="kanban-view" />
      </KanbanPresentation>
    );

    expect(screen.getByTestId('kanban-skeleton')).toBeInTheDocument();
    expect(
      screen.getByTestId('task-board-header-skeleton')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-header')).not.toBeInTheDocument();

    rerender(
      <KanbanPresentation
        boardId="board-1"
        currentView="kanban"
        header={<div data-testid="board-header" />}
        initialLayoutReady
      >
        <div data-testid="kanban-view" />
      </KanbanPresentation>
    );

    expect(screen.getByTestId('kanban-view')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-skeleton')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('task-board-header-skeleton')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('board-header').parentElement).not.toHaveClass(
      'invisible'
    );
    expect(
      screen.getByTestId('kanban-view').closest('[data-kanban-entrance]')
    ).toHaveAttribute('data-kanban-entrance', 'active');
  });

  it('keeps settled content visible during background revalidation', () => {
    const { rerender } = render(
      <KanbanPresentation
        boardId="board-1"
        currentView="kanban"
        header={<div data-testid="board-header" />}
        initialLayoutReady
      >
        <div data-testid="kanban-view" />
      </KanbanPresentation>
    );

    rerender(
      <KanbanPresentation
        boardId="board-1"
        currentView="kanban"
        header={<div data-testid="board-header" />}
        initialLayoutReady={false}
      >
        <div data-testid="kanban-view" />
      </KanbanPresentation>
    );

    expect(screen.getByTestId('kanban-view')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-skeleton')).not.toBeInTheDocument();
  });

  it('does not delay non-kanban views', () => {
    render(
      <KanbanPresentation
        boardId="board-1"
        currentView="list"
        header={<div data-testid="board-header" />}
        initialLayoutReady={false}
      >
        <div data-testid="list-view" />
      </KanbanPresentation>
    );

    expect(screen.getByTestId('list-view')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('board-header').parentElement).not.toHaveClass(
      'invisible'
    );
  });

  it('ends the entrance window without replaying during revalidation', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <KanbanPresentation
        boardId="board-1"
        currentView="kanban"
        header={<div data-testid="board-header" />}
        initialLayoutReady
      >
        <div data-testid="kanban-view" />
      </KanbanPresentation>
    );

    const presentation = screen
      .getByTestId('kanban-view')
      .closest('[data-kanban-layout-restored]');
    expect(presentation).toHaveAttribute('data-kanban-entrance', 'active');

    act(() => vi.advanceTimersByTime(1900));
    expect(presentation).not.toHaveAttribute('data-kanban-entrance');

    rerender(
      <KanbanPresentation
        boardId="board-1"
        currentView="kanban"
        header={<div data-testid="board-header" />}
        initialLayoutReady={false}
      >
        <div data-testid="kanban-view" />
      </KanbanPresentation>
    );

    expect(presentation).not.toHaveAttribute('data-kanban-entrance');
  });
});
