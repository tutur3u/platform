import { Check, Loader2, Plus, Tag } from '@tuturuuu/ui/icons';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';

interface WorkspaceTaskLabel {
  id: string;
  name: string;
  color: string;
}

interface TaskLabelsMenuProps {
  taskLabels: WorkspaceTaskLabel[];
  availableLabels: WorkspaceTaskLabel[];
  isLoading: boolean;
  labelsSaving: string | null;
  onToggleLabel: (labelId: string) => void;
  onCreateNewLabel: () => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
}

export function TaskLabelsMenu({
  taskLabels,
  availableLabels,
  isLoading,
  labelsSaving,
  onToggleLabel,
  onCreateNewLabel,
  onMenuItemSelect,
}: TaskLabelsMenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Tag className="h-4 w-4 text-dynamic-cyan" />
        Labels
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-[400px] w-56 overflow-hidden p-0">
        {isLoading && (
          <div className="px-2 py-1 text-muted-foreground text-xs">
            Loading...
          </div>
        )}
        {!isLoading && availableLabels.length === 0 && (
          <div className="px-2 py-2 text-center text-muted-foreground text-xs">
            No labels yet. Create your first label below.
          </div>
        )}
        {!isLoading && availableLabels.length > 0 && (
          <ScrollArea className="h-[min(300px,calc(100vh-200px))]">
            <div className="p-1">
              {availableLabels.map((label) => {
                const active = taskLabels.some((l) => l.id === label.id);
                return (
                  <DropdownMenuItem
                    key={label.id}
                    onSelect={(e) =>
                      onMenuItemSelect(e as unknown as Event, () =>
                        onToggleLabel(label.id)
                      )
                    }
                    disabled={labelsSaving === label.id}
                    className={cn(
                      'flex cursor-pointer items-center justify-between',
                      active && 'bg-dynamic-cyan/10 text-dynamic-cyan'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {labelsSaving === label.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: label.color,
                            opacity: 0.9,
                          }}
                        />
                      )}
                      <span className="truncate">{label.name}</span>
                    </div>
                    {active && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          </ScrollArea>
        )}
        {!isLoading && taskLabels.length > 0 && (
          <div className="border-t bg-background">
            <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
              {taskLabels.length} applied
            </div>
          </div>
        )}
        {!isLoading && (
          <div className="border-t bg-background">
            <DropdownMenuItem
              onSelect={(e) =>
                onMenuItemSelect(e as unknown as Event, () => {
                  onCreateNewLabel();
                })
              }
              className="flex cursor-pointer items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Add New Label
            </DropdownMenuItem>
          </div>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
