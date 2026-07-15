import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SelectiveRevertPanel } from './selective-revert-panel';

vi.mock('./description-diff-viewer', () => ({
  DescriptionDiffViewer: () => (
    <button type="button">view-description-diff</button>
  ),
}));

const t = (key: string, options?: { defaultValue?: string }) => {
  const messages: Record<string, string> = {
    changed: 'Changed',
    'field.description': 'Description',
    'field.name': 'Name',
    'field.priority': 'Priority',
    unchanged_fields: 'Unchanged fields',
  };

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
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('view-description-diff')).toBeInTheDocument();

    const unchangedButton = screen.getByRole('button', {
      name: /Unchanged fields/i,
    });
    expect(unchangedButton).toBeInTheDocument();
    expect(screen.queryByText('Priority')).not.toBeInTheDocument();

    fireEvent.click(unchangedButton);

    expect(screen.getByText('Priority')).toBeInTheDocument();
  });
});
