import { Check, Timer, X } from '@tuturuuu/ui/icons';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from '../../../shared/estimation-mapping';

interface TaskEstimationMenuProps {
  currentPoints: number | null | undefined;
  estimationType?: string;
  extendedEstimation?: boolean;
  allowZeroEstimates?: boolean;
  isLoading: boolean;
  onEstimationChange: (points: number | null) => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
}

export function TaskEstimationMenu({
  currentPoints,
  estimationType,
  extendedEstimation,
  allowZeroEstimates,
  isLoading,
  onEstimationChange,
  onMenuItemSelect,
}: TaskEstimationMenuProps) {
  if (!estimationType) return null;

  const indices = buildEstimationIndices({
    extended: extendedEstimation,
    allowZero: allowZeroEstimates,
  });

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Timer className="h-4 w-4 text-dynamic-pink" />
        Estimation
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-40">
        {indices.map((idx) => {
          const disabledByExtended = !extendedEstimation && idx > 5;
          const label = mapEstimationPoints(idx, estimationType);
          const isActive = currentPoints === idx;

          return (
            <DropdownMenuItem
              key={idx}
              onSelect={(e) =>
                onMenuItemSelect(e as unknown as Event, () =>
                  onEstimationChange(idx)
                )
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
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) =>
            onMenuItemSelect(e as unknown as Event, () =>
              onEstimationChange(null)
            )
          }
          className={cn(
            'cursor-pointer text-muted-foreground',
            currentPoints == null && 'bg-muted/50'
          )}
          disabled={isLoading}
        >
          <X className="h-4 w-4" /> None
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
