import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskDescriptionChangeDialog } from './task-description-change-dialog';

vi.mock('./description-diff-viewer', () => ({
  DescriptionDiffViewer: () => <button type="button">view-diff</button>,
}));

const t = (key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? key;

const makeDoc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  });

describe('TaskDescriptionChangeDialog', () => {
  it('offers restoring the previous recoverable description from a wipe row', async () => {
    const onRestoreVersion = vi.fn();

    render(
      <TaskDescriptionChangeDialog
        entry={{
          id: 'history-1',
          task_id: 'task-1',
          changed_by: 'user-1',
          changed_at: '2026-06-27T00:00:00.000Z',
          change_type: 'field_updated',
          field_name: 'description',
          old_value: makeDoc('Recover me'),
          new_value: null,
          metadata: {},
          user: { id: 'user-1', name: 'User' },
        }}
        isOpen
        onClose={vi.fn()}
        onRestoreVersion={onRestoreVersion}
        t={t}
      />
    );

    expect(screen.getByText('Recover me')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /restore previous/i }));

    await waitFor(() => {
      expect(onRestoreVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          previewText: 'Recover me',
          source: 'old_value',
        })
      );
    });
  });
});
