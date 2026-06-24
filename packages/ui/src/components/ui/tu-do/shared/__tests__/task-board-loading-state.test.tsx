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
      'bg-transparent'
    );
    expect(screen.getByTestId('kanban-skeleton')).toHaveClass('bg-transparent');
  });
});
