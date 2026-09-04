import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectiveRevertPanel } from './selective-revert-panel';

vi.mock('./description-diff-viewer', () => ({
  DescriptionDiffViewer: () => (
    <button type="button">view-description-diff</button>
  ),
}));

const t = (
  key: string,
  options?: { count?: number; defaultValue?: string }
) => {
  const messages: Record<string, string> = {
    changed: 'Changed',
    'field.description': 'Description',
    'field.name': 'Name',
    'field.priority': 'Priority',
    unchanged_fields: 'Unchanged fields',
  };

  if (key === 'fields_changed') return `${options?.count} fields different`;
  return messages[key] ?? options?.defaultValue ?? key;
};

const snapshot = {
  assignees: [],
  completed: false,
  description: {
    content: [
      {
        content: [{ text: 'Previous description', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  },
  end_date: null,
  estimation_points: null,
  id: 'task-1',
  labels: [],
  list_id: 'list-1',
  list_name: 'Review',
  name: 'Previous task name',
  priority: 'normal' as const,
  projects: [],
  start_date: null,
};

const currentTask = {
  ...snapshot,
  description: {
    content: [
      {
        content: [{ text: 'Current description', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  },
  list_name: 'Review',
  name: 'Current task name',
};

describe('SelectiveRevertPanel', () => {
  it('renders changed fields first and keeps unchanged fields collapsed', () => {
    render(
      <SelectiveRevertPanel
        currentTask={currentTask}
        isReverting={false}
        onRevert={vi.fn()}
        snapshot={snapshot}
        t={t}
      />
    );

    expect(screen.getByText('Core Fields')).toBeInTheDocument();
    expect(screen.getByText('2 fields different')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('view-description-diff')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Revert 2 field(s)' })
    ).toBeEnabled();

    const unchangedButton = screen.getByRole('button', {
      name: /Unchanged fields/i,
    });
    expect(unchangedButton).toBeInTheDocument();
    expect(screen.queryByText('Priority')).not.toBeInTheDocument();

    fireEvent.click(unchangedButton);

    expect(screen.getByText('Priority')).toBeInTheDocument();
  });

  it('restores the complete selected version by default', async () => {
    const onRevert = vi.fn().mockResolvedValue(undefined);
    render(
      <SelectiveRevertPanel
        currentTask={currentTask}
        isReverting={false}
        onRevert={onRevert}
        snapshot={snapshot}
        t={t}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Revert 2 field(s)' }));

    await waitFor(() => {
      expect(onRevert).toHaveBeenCalledWith(['name', 'description']);
    });
  });

  it('supports restoring only a selected subset', async () => {
    const onRevert = vi.fn().mockResolvedValue(undefined);
    render(
      <SelectiveRevertPanel
        currentTask={currentTask}
        isReverting={false}
        onRevert={onRevert}
        snapshot={snapshot}
        t={t}
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /Description/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Revert 1 field(s)' }));

    await waitFor(() => expect(onRevert).toHaveBeenCalledWith(['name']));
  });

  it('keeps restore controls hidden when explicitly disabled', () => {
    render(
      <SelectiveRevertPanel
        currentTask={currentTask}
        isReverting={false}
        onRevert={vi.fn()}
        revertDisabled
        snapshot={snapshot}
        t={t}
      />
    );

    expect(
      screen.queryByRole('button', { name: /Revert 2 field/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Snapshot reversion is currently disabled/i)
    ).toBeInTheDocument();
  });
});
