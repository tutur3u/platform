/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it, vi } from 'vitest';
import { TaskStatusControl } from './task-status-control';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const lists = [
  { id: 'q', name: 'Queued', status: 'not_started', position: 1 },
  { id: 'w', name: 'Waiting on USER', status: 'not_started', position: 2 },
  { id: 'a', name: 'Doing', status: 'active', position: 3 },
  { id: 'd', name: 'Done', status: 'done', position: 4 },
] as TaskList[];

describe('TaskStatusControl', () => {
  it('shows the status with the list name when the status has several lists', () => {
    render(
      <TaskStatusControl
        currentListId="w"
        lists={lists}
        onSelectList={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox')).toHaveTextContent(
      'status.todo · Waiting on USER'
    );
  });

  it('shows only the status when it has a single list', () => {
    render(
      <TaskStatusControl
        currentListId="a"
        lists={lists}
        onSelectList={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox')).toHaveTextContent(
      'status.in-progress'
    );
    expect(screen.getByRole('combobox')).not.toHaveTextContent('Doing');
  });

  it('is disabled for a list outside the six statuses and when read-only', () => {
    const docs = [
      { id: 'x', name: 'Docs', status: 'documents', position: 1 },
    ] as TaskList[];
    const { rerender } = render(
      <TaskStatusControl
        currentListId="x"
        lists={docs}
        onSelectList={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox')).toBeDisabled();

    rerender(
      <TaskStatusControl
        currentListId="a"
        disabled
        lists={lists}
        onSelectList={vi.fn()}
      />
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
