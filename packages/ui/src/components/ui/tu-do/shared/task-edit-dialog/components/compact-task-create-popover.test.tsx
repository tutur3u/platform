/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from '@tuturuuu/ui/dialog';
import { describe, expect, it, vi } from 'vitest';
import { CompactTaskCreatePopover } from './compact-task-create-popover';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./quick-settings-popover', () => ({
  QuickSettingsPopover: () => (
    <button type="button" aria-label="Quick Settings">
      Quick Settings
    </button>
  ),
}));

function renderCompactTaskCreatePopover({
  canSave = true,
  createMultiple = false,
  saveAsDraft = false,
}: {
  canSave?: boolean;
  createMultiple?: boolean;
  saveAsDraft?: boolean;
} = {}) {
  const props = {
    title: 'Create task',
    description: 'New task',
    titleInput: (
      <input aria-label="Task title" defaultValue="Draft compact title" />
    ),
    propertyControls: (
      <button type="button" aria-label="Priority: High">
        Priority
      </button>
    ),
    saveAsDraft,
    createMultiple,
    canSave,
    isLoading: false,
    isPersonalWorkspace: false,
    onSaveAsDraftChange: vi.fn(),
    onCreateMultipleChange: vi.fn(),
    onClose: vi.fn(),
    onFullscreen: vi.fn(),
    onSave: vi.fn(),
  };

  render(
    <Dialog open={true}>
      <CompactTaskCreatePopover {...props} />
    </Dialog>
  );

  return props;
}

describe('CompactTaskCreatePopover', () => {
  it('renders compact create content with accessible icon actions', () => {
    renderCompactTaskCreatePopover();

    expect(screen.getByTestId('compact-task-dialog-panel')).toBeTruthy();
    expect(screen.getByText('Create task')).toBeTruthy();
    expect(screen.getByLabelText('Task title')).toHaveProperty(
      'value',
      'Draft compact title'
    );
    expect(screen.getByLabelText('Priority: High')).toBeTruthy();
    expect(
      screen.getByLabelText('ws-task-boards.dialog.open_fullscreen')
    ).toBeTruthy();
    expect(screen.getByLabelText('common.close')).toBeTruthy();
    expect(screen.getByLabelText('task-drafts.save_as_draft')).toBeTruthy();
    expect(
      screen.getByLabelText('ws-task-boards.dialog.create_multiple')
    ).toBeTruthy();
    expect(screen.getByLabelText('Quick Settings')).toBeTruthy();
  });

  it('routes compact actions to the caller while keeping current form nodes mounted', () => {
    const props = renderCompactTaskCreatePopover();

    fireEvent.click(
      screen.getByLabelText('ws-task-boards.dialog.open_fullscreen')
    );
    fireEvent.click(screen.getByLabelText('task-drafts.save_as_draft'));
    fireEvent.click(
      screen.getByLabelText('ws-task-boards.dialog.create_multiple')
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'ws-task-boards.dialog.create_task',
      })
    );

    expect(props.onFullscreen).toHaveBeenCalledTimes(1);
    expect(props.onSaveAsDraftChange).toHaveBeenCalledWith(true);
    expect(props.onCreateMultipleChange).toHaveBeenCalledWith(true);
    expect(props.onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Task title')).toHaveProperty(
      'value',
      'Draft compact title'
    );
    expect(screen.getByLabelText('Priority: High')).toBeTruthy();
  });

  it('disables create when the dialog cannot save', () => {
    const props = renderCompactTaskCreatePopover({ canSave: false });
    const saveButton = screen.getByRole('button', {
      name: 'ws-task-boards.dialog.create_task',
    });

    expect(saveButton).toHaveProperty('disabled', true);
    fireEvent.click(saveButton);

    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('reflects draft and create-multiple toggled states', () => {
    renderCompactTaskCreatePopover({
      createMultiple: true,
      saveAsDraft: true,
    });

    expect(screen.getByLabelText('task-drafts.save_as_draft')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.getByLabelText('ws-task-boards.dialog.create_multiple')
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getAllByRole('button', { name: 'task-drafts.save_as_draft' })
    ).toHaveLength(2);
  });

  it('renders compact edit content without create-only footer actions', () => {
    render(
      <Dialog open={true}>
        <CompactTaskCreatePopover
          title="Edit task"
          titleInput={<input aria-label="Task title" defaultValue="Existing" />}
          propertyControls={
            <button type="button" aria-label="List: Inbox">
              List
            </button>
          }
          smartAction={
            <button type="button" aria-label="Smart action">
              Smart
            </button>
          }
          onClose={vi.fn()}
          onFullscreen={vi.fn()}
        />
      </Dialog>
    );

    expect(screen.getByText('Edit task')).toBeTruthy();
    expect(screen.getByLabelText('Task title')).toHaveProperty(
      'value',
      'Existing'
    );
    expect(screen.getByLabelText('List: Inbox')).toBeTruthy();
    expect(screen.getByLabelText('Smart action')).toBeTruthy();
    expect(
      screen.queryByLabelText('task-drafts.save_as_draft')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'ws-task-boards.dialog.create_task',
      })
    ).not.toBeInTheDocument();
  });

  it('renders compact edit actions when provided', () => {
    const onDelete = vi.fn();
    const onDone = vi.fn();
    const onClosed = vi.fn();

    render(
      <Dialog open={true}>
        <CompactTaskCreatePopover
          title="Edit task"
          titleInput={<input aria-label="Task title" defaultValue="Existing" />}
          propertyControls={
            <button type="button" aria-label="List: Inbox">
              List
            </button>
          }
          editActions={
            <>
              <button
                type="button"
                aria-label="common.mark_as_done"
                onClick={onDone}
              >
                Done
              </button>
              <button
                type="button"
                aria-label="common.mark_as_closed"
                onClick={onClosed}
              >
                Closed
              </button>
              <button
                type="button"
                aria-label="common.delete_task"
                onClick={onDelete}
              >
                Delete
              </button>
            </>
          }
          onClose={vi.fn()}
          onFullscreen={vi.fn()}
        />
      </Dialog>
    );

    fireEvent.click(screen.getByLabelText('common.mark_as_done'));
    fireEvent.click(screen.getByLabelText('common.mark_as_closed'));
    fireEvent.click(screen.getByLabelText('common.delete_task'));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
