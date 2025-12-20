import { Check, Loader2, Plus, Search, Tag } from '@tuturuuu/icons';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

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
  const [searchQuery, setSearchQuery] = useState('');

  // Filter labels based on search
  const filteredLabels = availableLabels.filter(
    (label) =>
      !searchQuery ||
      label.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Tag className="h-4 w-4 text-dynamic-cyan" />
        Labels
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80 p-0">
        {/* Search Input */}
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search labels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0"
            />
          </div>
        </div>

        {/* Labels List */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground text-xs">Loading...</p>
          </div>
        ) : filteredLabels.length === 0 ? (
          <div className="px-2 py-6 text-center text-muted-foreground text-xs">
            {searchQuery ? 'No labels found' : 'No labels available'}
          </div>
        ) : (
          <div className="max-h-[200px] overflow-auto">
            <div className="flex flex-col gap-1 p-1">
              {filteredLabels.map((label) => {
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
                      'flex cursor-pointer items-center justify-between gap-2',
                      active && 'bg-dynamic-cyan/10 text-dynamic-cyan'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {labelsSaving === label.id ? (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                      ) : (
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{
                            backgroundColor: label.color,
                            opacity: 0.9,
                          }}
                        />
                      )}
                      <span className="truncate text-sm">{label.name}</span>
                    </div>
                    {active && <Check className="h-4 w-4 shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer with count */}
        {!isLoading && taskLabels.length > 0 && (
          <div className="relative z-10 border-t bg-background shadow-sm">
            <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
              {taskLabels.length} applied
            </div>
          </div>
        )}

        {/* Create New Label Button */}
        {!isLoading && (
          <div className="border-t">
            <DropdownMenuItem
              onSelect={(e) =>
                onMenuItemSelect(e as unknown as Event, onCreateNewLabel)
              }
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              Create New Label
            </DropdownMenuItem>
          </div>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
