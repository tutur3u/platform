import '@testing-library/jest-dom';
import { DndContext } from '@dnd-kit/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { WorkspaceTaskList } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';
import type { BoardLayoutListItemCopy } from './board-layout-list-item';
import { BoardLayoutStatusGroup } from './board-layout-status-group';

const copy: BoardLayoutListItemCopy = {
  active: 'Active',
  backlog: 'Backlog',
  blue: 'Blue',
  changeColor: 'Change color',
  closed: 'Closed',
  cyan: 'Cyan',
  deleteList: 'Delete list',
  documents: 'Documents',
  doneStatus: 'Done',
  editList: 'Edit list',
  gray: 'Gray',
  green: 'Green',
  indigo: 'Indigo',
  orange: 'Orange',
  pink: 'Pink',
  purple: 'Purple',
  red: 'Red',
  review: 'Review',
  yellow: 'Yellow',
};
const list: WorkspaceTaskList = {
  archived: false,
  board_id: 'board',
  color: 'BLUE',
  created_at: '',
  creator_id: '',
  deleted: false,
  id: 'one',
  name: 'Planning',
  position: 0,
  status: 'not_started',
};
function setup(lists: WorkspaceTaskList[]) {
  const onAdd = vi.fn();
  render(
    <DndContext>
      <BoardLayoutStatusGroup
        addNewList="Add list"
        copy={copy}
        label="Backlog"
        lists={lists}
        noListsInStatus="No lists"
        onAdd={onAdd}
        onColorChange={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        status="not_started"
      />
    </DndContext>
  );
  return { onAdd };
}

describe('Board layout status sections', () => {
  it('shows list rows immediately with a keyboard drag handle and no collapse control', () => {
    setup([list]);
    expect(screen.getByRole('region', { name: 'Backlog' })).toBeVisible();
    expect(screen.getByText('Planning', { selector: 'p' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Planning' })).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(
      screen.queryByRole('button', { name: /^Backlog/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit list' })).toBeEnabled();
  });

  it('does not repeat the status inside list rows', () => {
    setup([list]);
    const row = screen
      .getByText('Planning', { selector: 'p' })
      .closest('.group') as HTMLElement;
    expect(within(row).queryByText('Backlog')).not.toBeInTheDocument();
    expect(screen.getAllByText('Backlog')).toHaveLength(1);
  });

  it('keeps empty statuses visible and provides a named add action', () => {
    const { onAdd } = setup([]);
    expect(screen.getByText('No lists')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Add list: Backlog' }));
    expect(onAdd).toHaveBeenCalledWith('not_started');
  });
});
