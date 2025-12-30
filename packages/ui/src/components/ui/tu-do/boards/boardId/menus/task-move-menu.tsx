import {
  CheckCircle2,
  CircleDashed,
  CircleFadingArrowUpIcon,
  CircleSlash,
  List,
  Move,
} from '@tuturuuu/icons';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';

interface TaskMoveMenuProps {
  currentListId: string;
  availableLists: TaskList[];
  isLoading: boolean;
  onMoveToList: (listId: string) => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
  translations?: {
    move?: string;
    noOtherListsAvailable?: string;
  };
}

const getStatusIcon = (status: TaskList['status']) => {
  switch (status) {
    case 'done':
      return CheckCircle2;
    case 'closed':
      return CircleSlash;
    case 'not_started':
      return CircleDashed;
    case 'active':
      return CircleFadingArrowUpIcon;
    default:
      return List;
  }
};

const getStatusColor = (status: TaskList['status']) => {
  switch (status) {
    case 'done':
      return 'text-dynamic-green';
    case 'closed':
      return 'text-dynamic-purple';
    case 'active':
      return 'text-dynamic-blue';
    default:
      return 'opacity-70';
  }
};

export function TaskMoveMenu({
  currentListId,
  availableLists,
  isLoading,
  onMoveToList,
  onMenuItemSelect,
  translations,
}: TaskMoveMenuProps) {
  // Use provided translations or fall back to English defaults
  const t = {
    move: translations?.move ?? 'Move',
    noOtherListsAvailable:
      translations?.noOtherListsAvailable ?? 'No other lists available',
  };

  const otherLists = availableLists.filter((list) => list.id !== currentListId);

  if (availableLists.length <= 1) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <div className="h-4 w-4">
          <Move className="h-4 w-4 text-dynamic-blue" />
        </div>
        <div className="flex w-full items-center justify-between">
          <span>{t.move}</span>
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-100 w-56 overflow-hidden p-0">
        {otherLists.length > 0 ? (
          <div className="max-h-50 overflow-auto">
            <div className="p-1">
              {otherLists.map((list) => {
                const StatusIcon = getStatusIcon(list.status);
                const statusColor = getStatusColor(list.status);

                return (
                  <DropdownMenuItem
                    key={list.id}
                    onSelect={(e) =>
                      onMenuItemSelect(e as unknown as Event, () =>
                        onMoveToList(list.id)
                      )
                    }
                    className="cursor-pointer"
                    disabled={isLoading}
                  >
                    <div className="flex w-full items-center justify-between">
                      <div className="flex items-center gap-3">
                        <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                        {list.name}
                      </div>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </div>
          </div>
        ) : (
          <DropdownMenuItem disabled className="text-muted-foreground">
            <List className="h-4 w-4" />
            {t.noOtherListsAvailable}
          </DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
