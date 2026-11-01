import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { TaskProject } from '../types';
import { EditProjectDialog } from './edit-project-dialog';

const project = {
  id: 'p1',
  name: 'Platform',
  description: null,
  ticket_key: 'PLA',
} as TaskProject;

function dialog(onSubmit = vi.fn()) {
  render(
    <NextIntlClientProvider
      locale="en"
      messages={{
        'task-projects': {
          edit_dialog: {
            title: 'Edit Project',
            description: 'Update the project details.',
            project_name: 'Project Name',
            project_name_placeholder: 'Name',
            description_label: 'Description',
            description_placeholder: 'Description',
            cancel: 'Cancel',
            updating: 'Updating',
            update_project: 'Update Project',
          },
        },
        task_project_detail: {
          configuration: {
            key_label: 'Key',
            key_preview: 'Preview: {identifier}',
            key_invalid: 'Invalid key',
          },
        },
      }}
    >
      <EditProjectDialog
        open
        onOpenChange={vi.fn()}
        project={project}
        onSubmit={onSubmit}
        isUpdating={false}
      />
    </NextIntlClientProvider>
  );
  return onSubmit;
}

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Update Project' }));

describe('EditProjectDialog ticket prefix', () => {
  it('leaves the key out when it did not change', () => {
    const onSubmit = dialog();
    submit();
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Platform',
      description: undefined,
      ticket_key: undefined,
    });
  });

  it('sends a changed key', () => {
    const onSubmit = dialog();
    fireEvent.change(screen.getByLabelText('Key'), {
      target: { value: 'core' },
    });
    submit();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_key: 'CORE' })
    );
  });

  it('blocks saving an invalid key', () => {
    const onSubmit = dialog();
    fireEvent.change(screen.getByLabelText('Key'), {
      target: { value: '1BAD' },
    });
    expect(
      screen.getByRole('button', { name: 'Update Project' })
    ).toBeDisabled();
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
