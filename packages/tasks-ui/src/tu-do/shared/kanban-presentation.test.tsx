import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KanbanPresentation } from './kanban-presentation';

describe('KanbanPresentation', () => {
  it('shows one skeleton until the finalized layout is ready', () => {
    const { rerender } = render(
      <KanbanPresentation
        boardId="board-1"
        currentView="kanban"
        initialLayoutReady={false}
      >
        <div data-testid="kanban-view" />
      </KanbanPresentation>
    );

    expect(screen.getByTestId('kanban-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-view')).not.toBeInTheDocument();

    rerender(
      <KanbanPresentation
        boardId="board-1"
        currentView="kanban"
        initialLayoutReady
      >
        <div data-testid="kanban-view" />
      </KanbanPresentation>
    );

    expect(screen.getByTestId('kanban-view')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-skeleton')).not.toBeInTheDocument();
  });

  it('keeps settled content visible during background revalidation', () => {
    const { rerender } = render(
      <KanbanPresentation
        boardId="board-1"
        currentView="kanban"
        initialLayoutReady
      >
        <div data-testid="kanban-view" />
      </KanbanPresentation>
    );

    rerender(
      <KanbanPresentation
        boardId="board-1"
        currentView="kanban"
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
        initialLayoutReady={false}
      >
        <div data-testid="list-view" />
      </KanbanPresentation>
    );

    expect(screen.getByTestId('list-view')).toBeInTheDocument();
    expect(screen.queryByTestId('kanban-skeleton')).not.toBeInTheDocument();
  });
});
