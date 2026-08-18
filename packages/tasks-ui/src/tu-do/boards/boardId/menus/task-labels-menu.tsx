import { Check, Loader2, Plus, Tag } from '@tuturuuu/icons';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { LabelChip, type TaskLabel } from '../../../shared/label-chip';
import { TaskCommandSearchInput } from '../../../shared/task-command-search-input';
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
  const select = (action: () => void) =>
    onMenuItemSelect(
      { preventDefault: () => undefined } as unknown as Event,
      action
    );

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Tag className="h-4 w-4 text-dynamic-cyan" />
        {t.labels}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80 p-0">
        <Command shouldFilter={false} className="rounded-none border-0">
          <TaskCommandSearchInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder={t.searchLabels}
            className="h-9"
          />
          <CommandList className="max-h-64">
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
              <CommandGroup>
                {filteredLabels.map((label) => {
                  const active = taskLabels.some((l) => l.id === label.id);
                  return (
                    <CommandItem
                      key={label.id}
                      value={`${label.name ?? ''} ${label.id}`}
                      aria-checked={active}
                      role="menuitemcheckbox"
                      onSelect={() => select(() => onToggleLabel(label.id))}
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
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {!isLoading && taskLabels.length > 0 && (
              <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
                {taskLabels.length} {t.applied}
              </div>
            )}

            {!isLoading && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={t.createNewLabel}
                    onSelect={() => select(onCreateNewLabel)}
                    className="cursor-pointer text-muted-foreground"
                  >
                    <Plus className="h-4 w-4" />
                    {t.createNewLabel}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
