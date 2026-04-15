import { Move } from '@tuturuuu/icons';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { TaskListPickerPanel } from '../../../shared/task-edit-dialog/components/task-list-picker-panel';

interface TaskMoveMenuProps {
  currentListId: string;
  availableLists: TaskList[];
  isLoading: boolean;
  onMoveToList: (listId: string) => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
  onRequestOpenCreateDialog: () => void;
  translations?: {
    move?: string;
  };
}

export function TaskMoveMenu({
  currentListId,
  availableLists,
  isLoading,
  onMoveToList,
  onMenuItemSelect,
  onRequestOpenCreateDialog,
  translations,
}: TaskMoveMenuProps) {
  const moveLabel = translations?.move ?? 'Move';

  const syntheticSelectEvent = () =>
    ({ preventDefault: () => {} }) as unknown as Event;

  if (availableLists.length === 0) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <div className="h-4 w-4">
          <Move className="h-4 w-4 text-dynamic-blue" />
        </div>
        <div className="flex w-full items-center justify-between">
          <span>{moveLabel}</span>
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80 overflow-hidden p-0">
        <TaskListPickerPanel
          selectedListId={currentListId}
          availableLists={availableLists}
          disabled={isLoading}
          onSelectList={(listId) => {
            onMenuItemSelect(syntheticSelectEvent(), () =>
              onMoveToList(listId)
            );
          }}
          onRequestOpenCreateDialog={onRequestOpenCreateDialog}
          className="w-full"
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
