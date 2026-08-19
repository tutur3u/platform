import { Check, Timer, X } from '@tuturuuu/icons';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  DropdownMenuSub,
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

interface TaskEstimationMenuProps {
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

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Timer className="h-4 w-4 text-dynamic-pink" />
        Estimation
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-48 overflow-hidden p-0"
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
                {filteredOptions.map(({ idx, label }) => {
                  const disabledByExtended = !extendedEstimation && idx > 5;
                  const isActive = currentPoints === idx;

                  return (
                    <CommandItem
                      key={idx}
                      value={`${label} ${idx}`}
                      onSelect={() =>
                        select(() => {
                          onEstimationChange(isActive ? null : idx);
                          onClose?.();
                        })
                      }
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
                      {isActive && <Check className="h-4 w-4" />}
                    </CommandItem>
                  );
                })}
                {showNone && (
                  <CommandItem
                    value={`none ${noneLabel}`}
                    onSelect={() =>
                      select(() => {
                        onEstimationChange(null);
                        onClose?.();
                      })
                    }
                    className={cn(
                      'cursor-pointer text-muted-foreground',
                      currentPoints == null && 'bg-muted/50'
                    )}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">{noneLabel}</span>
                    {currentPoints == null && <Check className="h-4 w-4" />}
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
