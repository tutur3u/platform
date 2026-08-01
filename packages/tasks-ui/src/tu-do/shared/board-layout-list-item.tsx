import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreVertical, Pencil, Trash2 } from '@tuturuuu/icons';
import type { WorkspaceTaskList } from '@tuturuuu/types';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useMemo } from 'react';
import {
  boardListColorClasses,
  boardStatusConfig,
} from './board-layout-settings-config';
import { translateTaskListNameForDisplay } from './utils/translate-task-list-display-name';

export interface BoardLayoutListItemCopy {
  active: string;
  backlog: string;
  blue: string;
  changeColor: string;
  closed: string;
  cyan: string;
  deleteList: string;
  documents: string;
  doneStatus: string;
  editList: string;
  gray: string;
  green: string;
  indigo: string;
  orange: string;
  pink: string;
  purple: string;
  red: string;
  review: string;
  yellow: string;
}

interface Props {
  copy: BoardLayoutListItemCopy;
  list: WorkspaceTaskList;
  onColorChange: (listId: string, color: SupportedColor) => void;
  onDelete: (list: WorkspaceTaskList) => void;
  onEdit: (list: WorkspaceTaskList) => void;
}

export function BoardLayoutListItem({
  copy,
  list,
  onColorChange,
  onDelete,
  onEdit,
}: Props) {
  const statusLabels: Record<TaskBoardStatus, string> = {
    not_started: copy.backlog,
    active: copy.active,
    review: copy.review,
    done: copy.doneStatus,
    closed: copy.closed,
    documents: copy.documents,
  };
  const listDisplayName = translateTaskListNameForDisplay(list.name ?? '', {
    toDo: statusLabels.not_started,
    inProgress: statusLabels.active,
    review: statusLabels.review,
    done: statusLabels.done,
    closed: statusLabels.closed,
    documents: statusLabels.documents,
  });
  const colorOptions = useMemo(
    () =>
      [
        ['GRAY', copy.gray, 'bg-dynamic-gray/30'],
        ['RED', copy.red, 'bg-dynamic-red/30'],
        ['BLUE', copy.blue, 'bg-dynamic-blue/30'],
        ['GREEN', copy.green, 'bg-dynamic-green/30'],
        ['YELLOW', copy.yellow, 'bg-dynamic-yellow/30'],
        ['ORANGE', copy.orange, 'bg-dynamic-orange/30'],
        ['PURPLE', copy.purple, 'bg-dynamic-purple/30'],
        ['PINK', copy.pink, 'bg-dynamic-pink/30'],
        ['INDIGO', copy.indigo, 'bg-dynamic-indigo/30'],
        ['CYAN', copy.cyan, 'bg-dynamic-cyan/30'],
      ] as const,
    [copy]
  );
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: list.id });
  const status = list.status ?? 'not_started';
  const StatusIcon = boardStatusConfig[status].icon;
  const listColor = (list.color as SupportedColor) || 'GRAY';

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex items-center gap-3 rounded-xl border border-l-4 bg-background/90 p-3 shadow-xs transition-[border-color,box-shadow,opacity,transform]',
        boardListColorClasses[listColor],
        isDragging
          ? 'relative z-20 scale-[1.01] opacity-60 shadow-lg'
          : 'hover:border-primary/30 hover:shadow-sm'
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground active:cursor-grabbing"
      >
        <span className="sr-only">{listDisplayName}</span>
        <GripVertical className="size-4" />
      </button>

      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg border',
          boardStatusConfig[status].bgColor,
          boardStatusConfig[status].borderColor
        )}
      >
        <StatusIcon className={cn('size-4', boardStatusConfig[status].color)} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{listDisplayName}</p>
        <Badge className="mt-1 h-5 px-1.5 text-[10px]" variant="outline">
          {statusLabels[status]}
        </Badge>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={copy.editList}
            className="size-8 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
            size="icon"
            variant="ghost"
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1 font-medium text-muted-foreground text-xs">
            {copy.changeColor}
          </div>
          <div className="grid grid-cols-5 gap-1 p-2">
            {colorOptions.map(([value, label, colorClass]) => (
              <button
                aria-label={label}
                className={cn(
                  'size-6 rounded-md border-2 transition-transform hover:scale-110',
                  colorClass,
                  listColor === value && 'scale-110 ring-2 ring-primary'
                )}
                key={value}
                onClick={() => onColorChange(list.id, value)}
                type="button"
              />
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onClick={() => onEdit(list)}>
            <Pencil className="size-4" />
            {copy.editList}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-dynamic-red/80 focus:text-dynamic-red"
            onClick={() => onDelete(list)}
          >
            <Trash2 className="size-4" />
            {copy.deleteList}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
