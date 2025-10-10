import { Button } from '@tuturuuu/ui/button';
import { Timer, X } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { memo, useMemo } from 'react';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from '../../estimation-mapping';

interface TaskEditEstimationSectionProps {
  estimationPoints: number | null | undefined;
  estimationType?: string;
  extendedEstimation?: boolean;
  allowZeroEstimates?: boolean;
  onEstimationChange: (points: number | null) => void;
}

export const TaskEditEstimationSection = memo(
  function TaskEditEstimationSection({
    estimationPoints,
    estimationType = 'fibonacci',
    extendedEstimation = false,
    allowZeroEstimates = false,
    onEstimationChange,
  }: TaskEditEstimationSectionProps) {
    const estimationOptions = useMemo(() => {
      return buildEstimationIndices({
        extended: extendedEstimation,
        allowZero: allowZeroEstimates,
      });
    }, [extendedEstimation, allowZeroEstimates]);

    const getLabel = (points: number) => {
      return mapEstimationPoints(points, estimationType);
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 font-medium text-sm">
            <Timer className="h-4 w-4" />
            Estimation
          </Label>
          {estimationPoints !== null && estimationPoints !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEstimationChange(null)}
              className="h-7 gap-1 text-muted-foreground text-xs hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>

        <div className="grid grid-cols-6 gap-2">
          {estimationOptions.map((points) => {
            const isSelected = estimationPoints === points;

            return (
              <Button
                key={points}
                variant={isSelected ? 'default' : 'outline'}
                size="sm"
                onClick={() => onEstimationChange(points)}
                className={cn(
                  'h-10 font-semibold transition-all',
                  isSelected && 'ring-2 ring-primary/50'
                )}
              >
                {getLabel(points)}
              </Button>
            );
          })}
        </div>

        {estimationPoints !== null && estimationPoints !== undefined && (
          <div className="rounded-md border bg-muted/50 p-3 text-center">
            <div className="text-muted-foreground text-xs">
              Current Estimate
            </div>
            <div className="mt-1 font-bold text-2xl">
              {getLabel(estimationPoints)}
            </div>
          </div>
        )}
      </div>
    );
  }
);
