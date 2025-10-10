import { Button } from '@tuturuuu/ui/button';
import { Timer, X } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import { cn } from '@tuturuuu/utils/format';
import { memo, useMemo } from 'react';

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
      const fibonacciBase = [1, 2, 3, 5, 8, 13];
      const fibonacciExtended = [...fibonacciBase, 21, 34, 55, 89];
      const linearBase = [1, 2, 3, 4, 5, 6];
      const linearExtended = [...linearBase, 7, 8, 9, 10];
      const tshirtBase = [1, 2, 3, 5, 8]; // XS, S, M, L, XL
      const tshirtExtended = [...tshirtBase, 13, 21]; // XXL, XXXL

      let options: number[] = [];

      switch (estimationType) {
        case 'fibonacci':
          options = extendedEstimation ? fibonacciExtended : fibonacciBase;
          break;
        case 'linear':
          options = extendedEstimation ? linearExtended : linearBase;
          break;
        case 'tshirt':
          options = extendedEstimation ? tshirtExtended : tshirtBase;
          break;
        default:
          options = fibonacciBase;
      }

      if (allowZeroEstimates) {
        options = [0, ...options];
      }

      return options;
    }, [estimationType, extendedEstimation, allowZeroEstimates]);

    const getTshirtLabel = (points: number) => {
      const labels: Record<number, string> = {
        1: 'XS',
        2: 'S',
        3: 'M',
        5: 'L',
        8: 'XL',
        13: 'XXL',
        21: 'XXXL',
      };
      return labels[points] || points.toString();
    };

    const getLabel = (points: number) => {
      if (estimationType === 'tshirt') {
        return getTshirtLabel(points);
      }
      return points.toString();
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
              {estimationType === 'tshirt'
                ? getTshirtLabel(estimationPoints)
                : estimationPoints}
            </div>
          </div>
        )}
      </div>
    );
  }
);
