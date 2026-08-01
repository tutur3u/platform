import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from '@tuturuuu/icons';
import type { WorkspaceTaskList } from '@tuturuuu/types';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
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
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-2xl border bg-muted/15 px-4 transition-[border-color,background-color,box-shadow]',
        boardStatusConfig[status].borderColor,
        isOver && 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
      )}
    >
      <AccordionItem className="border-0" value={status}>
        <div className="flex items-center gap-2">
          <AccordionTrigger className="min-w-0 flex-1 py-4 hover:no-underline">
            <div className="flex min-w-0 items-center gap-3 text-left">
              <div
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl border',
                  boardStatusConfig[status].bgColor,
                  boardStatusConfig[status].borderColor
                )}
              >
                <StatusIcon
                  className={cn('size-4', boardStatusConfig[status].color)}
                />
              </div>
              <span className="truncate font-semibold text-sm">{label}</span>
              <Badge
                className="h-5 min-w-5 px-1.5 text-[10px]"
                variant="secondary"
              >
                {lists.length}
              </Badge>
            </div>
          </AccordionTrigger>
          <Button
            className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground"
            onClick={() => onAdd(status)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">{addNewList}</span>
          </Button>
        </div>
        <AccordionContent className="pb-4">
          <SortableContext
            items={lists.map((list) => list.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {lists.length === 0 ? (
                <button
                  className={cn(
                    'flex min-h-20 w-full items-center justify-center rounded-xl border border-dashed bg-background/50 px-4 text-center text-muted-foreground text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground',
                    isOver && 'border-primary bg-primary/5 text-foreground'
                  )}
                  onClick={() => onAdd(status)}
                  type="button"
                >
                  {noListsInStatus}
                </button>
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
        </AccordionContent>
      </AccordionItem>
    </div>
  );
}
