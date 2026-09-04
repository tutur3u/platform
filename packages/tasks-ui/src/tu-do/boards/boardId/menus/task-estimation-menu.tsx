import { Check, Timer, X } from '@tuturuuu/icons';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from '../../../shared/estimation-mapping';
import {
  clearTaskCommandSearchOnEscape,
  TaskCommandSearchInput,
} from '../../../shared/task-command-search-input';
import {
  handleTaskOptionShortcut,
  TaskOptionShortcutHint,
} from '../../../shared/task-option-shortcuts';
import { TaskControlledSubmenu } from './task-submenu-controller';

interface TaskEstimationMenuProps {
  forceOpen?: boolean;
  currentPoints: number | null | undefined;
  estimationType?: string;
  extendedEstimation?: boolean;
  allowZeroEstimates?: boolean;
  isLoading: boolean;
  onEstimationChange: (points: number | null) => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
  onClose?: () => void;
}

export function TaskEstimationMenu({
  forceOpen,
  currentPoints,
  estimationType,
  extendedEstimation,
  allowZeroEstimates,
  isLoading,
  onEstimationChange,
  onMenuItemSelect,
  onClose,
}: TaskEstimationMenuProps) {
  const commonT = useTranslations('common');
  const [searchQuery, setSearchQuery] = useState('');
  if (!estimationType) return null;

  const indices = buildEstimationIndices({
    extended: extendedEstimation,
    allowZero: allowZeroEstimates,
  });
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const options = indices.map((idx) => ({
    idx,
    label: mapEstimationPoints(idx, estimationType),
  }));
  const filteredOptions = options.filter(({ idx, label }) =>
    `${label} ${idx}`.toLocaleLowerCase().includes(normalizedQuery)
  );
  const noneLabel = commonT('none');
  const showNone = noneLabel.toLocaleLowerCase().includes(normalizedQuery);
  const select = (action: () => void) =>
    onMenuItemSelect(
      { preventDefault: () => undefined } as unknown as Event,
      action
    );
  const selectEstimation = (points: number | null) =>
    select(() => {
      onEstimationChange(points);
      onClose?.();
    });

  return (
    <TaskControlledSubmenu submenuId="estimation" forceOpen={forceOpen}>
      <DropdownMenuSubTrigger>
        <Timer className="h-4 w-4 text-dynamic-pink" />
        Estimation
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-48 overflow-hidden p-0"
        onKeyDownCapture={(event) =>
          handleTaskOptionShortcut(event, Boolean(forceOpen), (digit) => {
            if (isLoading) return false;
            if (digit === 0) {
              selectEstimation(null);
              return true;
            }
            const option = filteredOptions[digit - 1];
            if (!option || (!extendedEstimation && option.idx > 5)) {
              return false;
            }
            selectEstimation(currentPoints === option.idx ? null : option.idx);
            return true;
          })
        }
        onEscapeKeyDown={(event) =>
          clearTaskCommandSearchOnEscape(event, searchQuery, setSearchQuery)
        }
      >
        <Command shouldFilter={false} className="rounded-none border-0">
          <TaskCommandSearchInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder={`${commonT('search')}...`}
            className="h-9"
          />
          <CommandList className="max-h-64">
            {!showNone && filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-muted-foreground text-xs">
                {commonT('no-results')}
              </div>
            ) : (
              <CommandGroup>
                {filteredOptions.map(({ idx, label }, index) => {
                  const disabledByExtended = !extendedEstimation && idx > 5;
                  const isActive = currentPoints === idx;

                  return (
                    <CommandItem
                      key={idx}
                      value={`${label} ${idx}`}
                      onSelect={() => selectEstimation(isActive ? null : idx)}
                      className={cn(
                        'flex cursor-pointer items-center justify-between',
                        isActive && 'bg-dynamic-pink/10 text-dynamic-pink'
                      )}
                      disabled={isLoading || disabledByExtended}
                    >
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4 text-dynamic-pink" />
                        <span>
                          {label}
                          {disabledByExtended && (
                            <span className="ml-1 text-[10px] text-muted-foreground/60">
                              (upgrade)
                            </span>
                          )}
                        </span>
                      </div>
                      <TaskOptionShortcutHint
                        digit={index + 1}
                        visible={!!forceOpen && index < 9}
                      />
                      {isActive && <Check className="h-4 w-4" />}
                    </CommandItem>
                  );
                })}
                {showNone && (
                  <CommandItem
                    value={`none ${noneLabel}`}
                    onSelect={() => selectEstimation(null)}
                    className={cn(
                      'cursor-pointer text-muted-foreground',
                      currentPoints == null && 'bg-muted/50'
                    )}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">{noneLabel}</span>
                    <TaskOptionShortcutHint digit={0} visible={!!forceOpen} />
                    {currentPoints == null && <Check className="h-4 w-4" />}
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DropdownMenuSubContent>
    </TaskControlledSubmenu>
  );
}
