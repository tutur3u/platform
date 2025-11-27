import { Check, Timer, X } from '@tuturuuu/icons';
import {
  DropdownMenuItem,
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
      <DropdownMenuSubContent className="max-h-[400px] w-40 overflow-hidden p-0">
        <div className="max-h-[200px] overflow-auto">
          <div className="p-1">
            {indices.map((idx) => {
              const disabledByExtended = !extendedEstimation && idx > 5;
              const label = mapEstimationPoints(idx, estimationType);
              const isActive = currentPoints === idx;

              return (
                <DropdownMenuItem
                  key={idx}
                  onSelect={(e) =>
                    onMenuItemSelect(e, () =>
                      // Toggle: if already active, remove estimation; otherwise set it
                      onEstimationChange(isActive ? null : idx)
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
          </div>
        </div>
        <div className="border-t bg-background">
          <DropdownMenuItem
            onSelect={(e) =>
              onMenuItemSelect(e, () => onEstimationChange(null))
            }
            className={cn(
              'cursor-pointer text-muted-foreground',
              currentPoints == null && 'bg-muted/50'
            )}
            disabled={isLoading}
          >
            <X className="h-4 w-4" /> None
          </DropdownMenuItem>
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
