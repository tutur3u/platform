import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskBoardLoadingState } from '../task-board-loading-state';

describe('TaskBoardLoadingState', () => {
  it('fills the padded board route with a transparent kanban skeleton', () => {
    render(<TaskBoardLoadingState root />);

    expect(screen.getByTestId('task-board-loading-state')).toHaveClass(
      '-m-4',
      'h-[calc(100dvh+2rem)]',
      'w-[calc(100%+2rem)]',
      'bg-transparent'
    );
    expect(screen.getByTestId('kanban-skeleton')).toHaveClass('bg-transparent');
    expect(screen.getByTestId('kanban-skeleton-frame')).toHaveClass(
      'px-0',
      'py-2'
    );
    expect(screen.getByTestId('kanban-skeleton-frame')).not.toHaveClass('p-2');
  });

  it('keeps embedded loading skeletons constrained to the parent width', () => {
    render(<TaskBoardLoadingState />);

    expect(screen.getByTestId('task-board-loading-state')).toHaveClass(
      'w-full',
      'h-[calc(100dvh-1rem)]'
    );
    expect(screen.getByTestId('task-board-loading-state')).not.toHaveClass(
      '-m-4',
      'w-[calc(100%+2rem)]'
    );
    expect(screen.getByTestId('kanban-skeleton-frame')).toHaveClass('p-2');
  });
});
