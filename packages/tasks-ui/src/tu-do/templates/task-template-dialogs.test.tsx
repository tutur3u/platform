import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceTaskTemplate } from './task-template-api';
import {
  CreateTaskTemplateDialog,
  SaveTaskTemplateFromTaskDialog,
  UseTaskTemplateDialog,
} from './task-template-dialogs';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.name ? `${key}:${values.name}` : key,
}));

const template: WorkspaceTaskTemplate = {
  archived_at: null,
  assignee_ids: [],
  created_at: '2026-06-29T00:00:00.000Z',
  created_by: 'user-1',
  default_board_id: 'board-1',
  default_list_id: 'list-1',
  description: 'Template body',
  description_yjs_state: null,
  end_date: null,
  estimation_points: null,
  id: 'template-1',
  isOwner: true,
  label_ids: [],
  name: 'Bug report',
  priority: 'high',
  project_ids: [],
  slug: 'bug-report',
  source_task_id: null,
  start_date: null,
  task_name: 'Investigate bug',
  updated_at: '2026-06-29T00:00:00.000Z',
  visibility: 'private',
  ws_id: 'ws-1',
};

describe('task template dialogs', () => {
  it('validates and emits create payloads for new templates', () => {
    const onCreate = vi.fn();

    render(
      <CreateTaskTemplateDialog
        onCreate={onCreate}
        onOpenChange={vi.fn()}
        open
        pending={false}
      />
    );

    const submit = screen.getByRole('button', { name: 'actions.create' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('fields.template_name'), {
      target: { value: 'Bug report' },
    });
    fireEvent.change(screen.getByLabelText('fields.key'), {
      target: { value: 'bug-report' },
    });
    fireEvent.change(screen.getByLabelText('fields.task_name'), {
      target: { value: 'Investigate bug' },
    });
    fireEvent.change(screen.getByLabelText('fields.description'), {
      target: { value: 'Reproduce and capture expected behavior.' },
    });
    fireEvent.click(submit);

    expect(onCreate).toHaveBeenCalledWith({
      description: 'Reproduce and capture expected behavior.',
      key: 'bug-report',
      name: 'Bug report',
      priority: null,
      task_name: 'Investigate bug',
      visibility: 'private',
    });
  });

  it('emits use-template payloads with override titles and selected lists', () => {
    const onUse = vi.fn();

    render(
      <UseTaskTemplateDialog
        boards={[
          {
            allow_zero_estimates: false,
            archived_at: null,
            count_unestimated_issues: false,
            created_at: '2026-06-29T00:00:00.000Z',
            deleted_at: null,
            estimation_type: null,
            extended_estimation: false,
            icon: null,
            id: 'board-1',
            name: 'Board',
            ticket_prefix: null,
            ws_id: 'ws-1',
          },
        ]}
        lists={[
          {
            color: null,
            id: 'list-1',
            name: 'Todo',
            position: 1,
            status: 'active',
          },
        ]}
        loadingLists={false}
        onBoardChange={vi.fn()}
        onListChange={vi.fn()}
        onOpenChange={vi.fn()}
        onUse={onUse}
        open
        pending={false}
        selectedBoardId="board-1"
        selectedListId="list-1"
        template={template}
      />
    );

    fireEvent.change(screen.getByLabelText('fields.override_name'), {
      target: { value: 'Checkout bug' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'actions.create_task' })
    );

    expect(onUse).toHaveBeenCalledWith({
      listId: 'list-1',
      name: 'Checkout bug',
    });
  });

  it('saves existing tasks as templates with private visibility by default', () => {
    const onSave = vi.fn();

    render(
      <SaveTaskTemplateFromTaskDialog
        onOpenChange={vi.fn()}
        onSave={onSave}
        open
        pending={false}
      />
    );

    const submit = screen.getByRole('button', { name: 'actions.save' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText('fields.task_id'), {
      target: { value: 'task-1' },
    });
    fireEvent.change(screen.getByLabelText('fields.template_name'), {
      target: { value: 'Release checklist' },
    });
    fireEvent.click(submit);

    expect(onSave).toHaveBeenCalledWith({
      name: 'Release checklist',
      taskId: 'task-1',
      visibility: 'private',
    });
  });
});
