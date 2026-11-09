import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from '@tuturuuu/icons';
import type { WorkspaceTaskList } from '@tuturuuu/types';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import {
  BoardLayoutListItem,
  type BoardLayoutListItemCopy,
} from './board-layout-list-item';
import { boardStatusConfig } from './board-layout-settings-config';

interface Props {
  addNewList: string;
  copy: BoardLayoutListItemCopy;
  label: string;
  lists: WorkspaceTaskList[];
  noListsInStatus: string;
  onAdd: (status: TaskBoardStatus) => void;
  onColorChange: (listId: string, color: SupportedColor) => void;
  onDelete: (list: WorkspaceTaskList) => void;
  onEdit: (list: WorkspaceTaskList) => void;
  status: TaskBoardStatus;
}

export function BoardLayoutStatusGroup({
  addNewList,
  copy,
  label,
  lists,
  noListsInStatus,
  onAdd,
  onColorChange,
  onDelete,
  onEdit,
  status,
}: Props) {
  const { isOver, setNodeRef } = useDroppable({ id: `status:${status}` });
  const StatusIcon = boardStatusConfig[status].icon;

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        'space-y-2 rounded-lg transition-colors',
        isOver && 'bg-accent/50 ring-2 ring-ring'
      )}
    >
      <div className="flex min-h-10 items-center gap-2">
        <StatusIcon
          className={cn('size-4 shrink-0', boardStatusConfig[status].color)}
        />
        <h4 className="min-w-0 truncate font-semibold text-sm">{label}</h4>
        <span className="text-muted-foreground text-xs">{lists.length}</span>
        <Button
          aria-label={`${addNewList}: ${label}`}
          className="ml-auto h-11 shrink-0 gap-1.5 px-2 text-muted-foreground md:h-8"
          onClick={() => onAdd(status)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Plus className="size-3.5" />
          <span>{addNewList}</span>
        </Button>
      </div>
      <SortableContext
        items={lists.map((list) => list.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="divide-y border-y">
          {lists.length === 0 ? (
            <p className="px-2 py-3 text-muted-foreground text-sm">
              {noListsInStatus}
            </p>
          ) : (
            lists.map((list) => (
              <BoardLayoutListItem
                copy={copy}
                key={list.id}
                list={list}
                onColorChange={onColorChange}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}
