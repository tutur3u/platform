import { Check, Loader2, Plus, Tag } from '@tuturuuu/icons';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { LabelChip, type TaskLabel } from '../../../shared/label-chip';
import { TaskResourceSearchField } from '../../../shared/task-resource-search-field';
import { labelNameMatchesQuery } from '../../../shared/task-resource-search-filters';

interface TaskLabelsMenuProps {
  taskLabels: Array<Pick<TaskLabel, 'id' | 'name' | 'color'>>;
  availableLabels: Array<Pick<TaskLabel, 'id' | 'name' | 'color'>>;
  isLoading: boolean;
  onToggleLabel: (labelId: string) => void;
  onCreateNewLabel: () => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
  translations?: {
    labels?: string;
    searchLabels?: string;
    loading?: string;
    noLabelsFound?: string;
    noLabelsAvailable?: string;
    applied?: string;
    createNewLabel?: string;
  };
}

export function TaskLabelsMenu({
  taskLabels,
  availableLabels,
  isLoading,
  onToggleLabel,
  onCreateNewLabel,
  onMenuItemSelect,
  translations,
}: TaskLabelsMenuProps) {
  const t = {
    labels: translations?.labels ?? 'Labels',
    searchLabels: translations?.searchLabels ?? 'Search labels...',
    loading: translations?.loading ?? 'Loading...',
    noLabelsFound: translations?.noLabelsFound ?? 'No labels found',
    noLabelsAvailable: translations?.noLabelsAvailable ?? 'No labels available',
    applied: translations?.applied ?? 'applied',
    createNewLabel: translations?.createNewLabel ?? 'Create New Label',
  };

  const [searchQuery, setSearchQuery] = useState('');

  const filteredLabels = availableLabels.filter((label) =>
    labelNameMatchesQuery(label.name, searchQuery)
  );

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Tag className="h-4 w-4 text-dynamic-cyan" />
        {t.labels}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80 p-0">
        <TaskResourceSearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={t.searchLabels}
        />

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground text-xs">{t.loading}</p>
          </div>
        ) : filteredLabels.length === 0 ? (
          <div className="px-2 py-6 text-center text-muted-foreground text-xs">
            {searchQuery ? t.noLabelsFound : t.noLabelsAvailable}
          </div>
        ) : (
          <div className="max-h-50 overflow-auto">
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
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-2',
                      active && 'bg-dynamic-cyan/10 text-dynamic-cyan'
                    )}
                  >
                    <LabelChip
                      label={label as TaskLabel}
                      showIcon={false}
                      className="h-6 px-2 text-xs"
                    />
                    {active && <Check className="h-4 w-4 shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          </div>
        )}

        {!isLoading && taskLabels.length > 0 && (
          <div className="relative z-10 border-t bg-background shadow-sm">
            <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
              {taskLabels.length} {t.applied}
            </div>
          </div>
        )}

        {!isLoading && (
          <div className="border-t">
            <DropdownMenuItem
              onSelect={(e) =>
                onMenuItemSelect(e as unknown as Event, onCreateNewLabel)
              }
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              {t.createNewLabel}
            </DropdownMenuItem>
          </div>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
