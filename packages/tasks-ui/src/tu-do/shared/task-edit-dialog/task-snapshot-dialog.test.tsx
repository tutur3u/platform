import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskSnapshotDialog } from './task-snapshot-dialog';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  snapshotResult: {
    data: undefined as
      | undefined
      | {
          snapshot: {
            id: string;
            name: string;
          };
        },
    error: null as Error | null,
    isLoading: true,
  },
}));

vi.mock('./hooks/use-task-snapshot', () => ({
  useTaskSnapshot: () => mocks.snapshotResult,
}));

vi.mock('./hooks/use-task-revert', () => ({
  useTaskRevert: () => ({
    isPending: false,
    mutateAsync: mocks.mutateAsync,
  }),
}));

vi.mock('./selective-revert-panel', () => ({
  SelectiveRevertPanel: ({
    onRevert,
    snapshot,
  }: {
    onRevert: (fields: ['name']) => Promise<void>;
    snapshot: { name: string };
  }) => (
    <button type="button" onClick={() => onRevert(['name'])}>
      Restore {snapshot.name}
    </button>
  ),
}));

const historyEntry = {
  id: '11111111-1111-4111-8111-111111111111',
  task_id: '22222222-2222-4222-8222-222222222222',
  changed_by: null,
  changed_at: '2026-08-24T00:00:00.000Z',
  change_type: 'field_updated' as const,
  field_name: 'name',
  old_value: 'Previous title',
  new_value: 'Current title',
  metadata: {},
  user: null,
};

const currentTask = {
  id: historyEntry.task_id,
  name: 'Current title',
  description: null,
  priority: null,
  start_date: null,
  end_date: null,
  estimation_points: null,
  list_id: '33333333-3333-4333-8333-333333333333',
  completed: false,
};

describe('TaskSnapshotDialog', () => {
  it('survives the loading render before a snapshot becomes available', () => {
    mocks.snapshotResult.data = undefined;
    mocks.snapshotResult.isLoading = true;

    const props = {
      boardId: '44444444-4444-4444-8444-444444444444',
      currentTask,
      historyEntry,
      isOpen: true,
      onClose: vi.fn(),
      taskId: historyEntry.task_id,
      wsId: '55555555-5555-4555-8555-555555555555',
    };
    const { rerender } = render(<TaskSnapshotDialog {...props} />);

    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();

    mocks.snapshotResult.data = {
      snapshot: { id: historyEntry.task_id, name: 'Previous title' },
    };
    mocks.snapshotResult.isLoading = false;
    rerender(<TaskSnapshotDialog {...props} />);

    expect(
      screen.getByRole('button', { name: 'Restore Previous title' })
    ).toBeInTheDocument();
  });

  it('submits the resolved snapshot instead of reading loading data', async () => {
    const snapshot = { id: historyEntry.task_id, name: 'Previous title' };
    mocks.snapshotResult.data = { snapshot };
    mocks.snapshotResult.isLoading = false;

    render(
      <TaskSnapshotDialog
        boardId="44444444-4444-4444-8444-444444444444"
        currentTask={currentTask}
        historyEntry={historyEntry}
        isOpen
        onClose={vi.fn()}
        taskId={historyEntry.task_id}
        wsId="55555555-5555-4555-8555-555555555555"
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Restore Previous title' })
    );

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      fields: ['name'],
      historyId: historyEntry.id,
      snapshot,
    });
  });
});
