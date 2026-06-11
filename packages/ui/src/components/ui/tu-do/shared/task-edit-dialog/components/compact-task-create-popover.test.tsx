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

    expect(screen.getByTestId('compact-task-create-popover')).toBeTruthy();
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
});
