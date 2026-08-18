import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TaskLabelsMenu } from '../task-labels-menu';
import { TaskMoveMenu } from '../task-move-menu';
import { TaskProjectsMenu } from '../task-projects-menu';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      'common.search': 'Search',
      'common.list_name_to_do': 'To Do',
      'common.list_name_in_progress': 'In Progress',
      'common.list_name_review': 'Review',
      'common.list_name_done': 'Done',
      'common.list_name_closed': 'Closed',
      'common.documents': 'Documents',
      'ws-task-boards.layout_settings.add_new_list': 'Add New List',
      'ws-task-boards.select_or_create_list': 'Select or create a list',
      'ws-task-boards.dialog.no_lists_found': 'No lists found',
    };
    return messages[key] ?? key;
  },
}));

vi.mock('@tuturuuu/ui/dropdown-menu', () => ({
  DropdownMenuSub: ({ children }: { children: ReactNode }) => children,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('../../../../shared/create-list-dialog', () => ({
  CreateListDialog: () => null,
}));

const runMenuAction = (_event: Event, action: () => void) => action();

describe('task resource menu keyboard UX', () => {
  it('auto-focuses labels, filters them, and toggles the highlighted result', async () => {
    const onToggleLabel = vi.fn();
    render(
      <TaskLabelsMenu
        taskLabels={[]}
        availableLabels={[
          { id: 'label-1', name: 'Bug', color: '#ef4444' },
          { id: 'label-2', name: 'Feature', color: '#22c55e' },
        ]}
        isLoading={false}
        onToggleLabel={onToggleLabel}
        onCreateNewLabel={vi.fn()}
        onMenuItemSelect={runMenuAction}
      />
    );

    const search = screen.getByPlaceholderText('Search labels...');
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'feature' } });
    expect(screen.queryByText('Bug')).not.toBeInTheDocument();

    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(screen.getByText('Bug')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'feature' } });

    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(onToggleLabel).toHaveBeenCalledWith('label-2'));
  });

  it('navigates project choices with Arrow keys and toggles with Enter', async () => {
    const onToggleProject = vi.fn();
    render(
      <TaskProjectsMenu
        taskProjects={[]}
        availableProjects={[
          { id: 'project-1', name: 'Alpha', status: 'active' },
          { id: 'project-2', name: 'Beta', status: null },
        ]}
        isLoading={false}
        onToggleProject={onToggleProject}
        onCreateNewProject={vi.fn()}
        onMenuItemSelect={runMenuAction}
      />
    );

    const search = screen.getByPlaceholderText('Search projects...');
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    await waitFor(() =>
      expect(onToggleProject).toHaveBeenCalledWith('project-2')
    );
  });

  it('searches and selects a move destination without leaving the keyboard', async () => {
    const onMoveToList = vi.fn();
    const lists = [
      { id: 'list-1', name: 'Backlog', status: 'not_started' },
      { id: 'list-2', name: 'Sprint lane', status: 'active' },
    ] as TaskList[];

    render(
      <TaskMoveMenu
        currentListId="list-1"
        availableLists={lists}
        isLoading={false}
        onMoveToList={onMoveToList}
        onMenuItemSelect={runMenuAction}
        onRequestOpenCreateDialog={vi.fn()}
      />
    );

    const search = screen.getByPlaceholderText('Search...');
    fireEvent.change(search, { target: { value: 'Sprint' } });
    expect(screen.queryByText('Backlog')).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Enter' });

    await waitFor(() => expect(onMoveToList).toHaveBeenCalledWith('list-2'));
  });
});
