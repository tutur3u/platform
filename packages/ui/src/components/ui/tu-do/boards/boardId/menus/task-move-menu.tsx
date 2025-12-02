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
}: TaskMoveMenuProps) {
  const otherLists = availableLists.filter((list) => list.id !== currentListId);

  if (availableLists.length <= 1) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <div className="h-4 w-4">
          <Move className="h-4 w-4 text-dynamic-blue" />
        </div>
        <div className="flex w-full items-center justify-between">
          <span>Move</span>
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-[400px] w-56 overflow-hidden p-0">
        {otherLists.length > 0 ? (
          <div className="max-h-[200px] overflow-auto">
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
            No other lists available
          </DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
