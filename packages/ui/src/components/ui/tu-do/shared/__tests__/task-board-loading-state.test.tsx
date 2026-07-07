import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TaskBoardLoadingState } from '../task-board-loading-state';

describe('TaskBoardLoadingState', () => {
  it('fills the padded board route with a transparent kanban skeleton', () => {
    render(<TaskBoardLoadingState root />);

    expect(screen.getByTestId('task-board-loading-state')).toHaveClass(
      '-mt-4',
      '-mb-4',
      '-ml-4',
      'h-[calc(100dvh+2rem)]',
      'w-[calc(100%+2rem)]',
      'bg-transparent'
    );
    expect(screen.getByTestId('task-board-loading-state')).not.toHaveClass(
      '-m-4',
      '-mr-4'
    );
    expect(screen.getByTestId('kanban-skeleton')).toHaveClass('bg-transparent');
    expect(screen.getByTestId('kanban-skeleton-frame')).toHaveClass(
      'py-2',
      'pl-2',
      'pr-0'
    );
    expect(screen.getByTestId('kanban-skeleton-frame')).not.toHaveClass('p-2');
    expect(
      screen.queryByTestId('task-board-header-skeleton')
    ).not.toBeInTheDocument();
  });

  it('keeps embedded loading skeletons constrained to the parent width', () => {
    render(<TaskBoardLoadingState />);

    expect(screen.getByTestId('task-board-loading-state')).toHaveClass(
      'w-full',
      'h-[calc(100dvh-1rem)]'
    );
    expect(screen.getByTestId('task-board-loading-state')).not.toHaveClass(
      '-m-4',
      '-mt-4',
      '-mb-4',
      '-ml-4',
      'w-[calc(100%+2rem)]'
    );
    expect(screen.getByTestId('kanban-skeleton-frame')).toHaveClass('p-2');
    expect(
      screen.queryByTestId('task-board-header-skeleton')
    ).not.toBeInTheDocument();
  });

  it('can include the board header skeleton above the kanban skeleton', () => {
    render(<TaskBoardLoadingState root showHeader />);

    expect(screen.getByTestId('task-board-loading-state')).toHaveClass(
      '-mt-4',
      '-mb-4',
      '-ml-4',
      'h-[calc(100dvh+2rem)]',
      'w-[calc(100%+2rem)]',
      'flex',
      'flex-col'
    );
    expect(screen.getByTestId('task-board-loading-state')).not.toHaveClass(
      '-m-4',
      '-mr-4'
    );
    expect(screen.getByTestId('task-board-header-skeleton')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByTestId('task-board-header-skeleton')).toHaveClass(
      'border-b',
      'pl-2',
      'pr-0',
      'pt-2',
      'pb-2'
    );
    expect(screen.getByTestId('task-board-header-skeleton')).not.toHaveClass(
      'px-2'
    );
    expect(screen.getByTestId('kanban-skeleton-frame')).toHaveClass(
      'py-2',
      'pl-2',
      'pr-0'
    );
    expect(screen.getByTestId('task-board-header-skeleton')).not.toHaveClass(
      '-mt-2'
    );
    expect(screen.getByTestId('task-board-loading-body')).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-hidden'
    );
    expect(screen.getByTestId('kanban-skeleton')).toBeInTheDocument();
  });
});
