'use client';

import {
  BarChart3,
  Calculator,
  CheckSquare,
  Loader2,
  Target,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import React from 'react';

interface BoardEstimationConfigDialogProps {
  open: boolean;
  wsId: string;
  boardId: string;
  boardName: string;
  currentEstimationType: string | null;
  currentExtendedEstimation: boolean;
  currentAllowZeroEstimates: boolean;
  currentCountUnestimatedIssues: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const estimationTypes = [
  {
    value: 'none' as const,
    actualValue: null,
    label: 'No Estimation',
    description: 'No estimation method configured',
    color: 'bg-muted/50 text-muted-foreground',
  },
  {
    value: 'fibonacci' as const,
    actualValue: 'fibonacci' as const,
    label: 'Fibonacci',
    description: '0, 1, 2, 3, 5, 8',
    color: 'bg-dynamic-blue/10 text-dynamic-blue',
  },
  {
    value: 'linear' as const,
    actualValue: 'linear' as const,
    label: 'Linear',
    description: '0, 1, 2, 3, 4, 5',
    color: 'bg-dynamic-green/10 text-dynamic-green',
  },
  {
    value: 'exponential' as const,
    actualValue: 'exponential' as const,
    label: 'Exponential',
    description: '0, 1, 2, 4, 8, 16',
    color: 'bg-dynamic-purple/10 text-dynamic-purple',
  },
  {
    value: 't-shirt' as const,
    actualValue: 't-shirt' as const,
    label: 'T-Shirt Sizes',
    description: '-, XS, S, M, L, XL',
    color: 'bg-dynamic-orange/10 text-dynamic-orange',
  },
];

export function BoardEstimationConfigDialog({
  open,
  wsId,
  boardId,
  boardName,
  currentEstimationType,
  currentExtendedEstimation,
  currentAllowZeroEstimates,
  currentCountUnestimatedIssues,
  onOpenChange,
  onSuccess,
}: BoardEstimationConfigDialogProps) {
  const [selectedEstimationType, setSelectedEstimationType] =
    React.useState<string>('none');
  const [extendedEstimation, setExtendedEstimation] =
    React.useState<boolean>(false);
  const [allowZeroEstimates, setAllowZeroEstimates] =
    React.useState<boolean>(true);
  const [countUnestimatedIssues, setCountUnestimatedIssues] =
    React.useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);

  // Initialize state when dialog opens
  React.useEffect(() => {
    if (open) {
      const selectValue =
        currentEstimationType === null ? 'none' : currentEstimationType;
      setSelectedEstimationType(selectValue || 'none');
      setExtendedEstimation(currentExtendedEstimation || false);
      setAllowZeroEstimates(currentAllowZeroEstimates ?? true);
      setCountUnestimatedIssues(currentCountUnestimatedIssues || false);
    }
  }, [
    open,
    currentEstimationType,
    currentExtendedEstimation,
    currentAllowZeroEstimates,
    currentCountUnestimatedIssues,
  ]);

  const getRangeInfo = (type: string) => {
    switch (type) {
      case 'fibonacci':
        return {
          label: 'Fibonacci Sequence Range',
          standard: {
            label: 'Standard Range',
            description: '0, 1, 2, 3, 5, 8',
          },
          extended: {
            label: 'Extended Range',
            description: '0, 1, 2, 3, 5, 8, 13, 21',
          },
        };
      case 'linear':
        return {
          label: 'Linear Scale Range',
          standard: {
            label: 'Standard Range',
            description: '0, 1, 2, 3, 4, 5',
          },
          extended: {
            label: 'Extended Range',
            description: '0, 1, 2, 3, 4, 5, 6, 7',
          },
        };
      case 'exponential':
        return {
          label: 'Exponential Scale Range',
          standard: {
            label: 'Standard Range',
            description: '0, 1, 2, 4, 8, 16',
          },
          extended: {
            label: 'Extended Range',
            description: '0, 1, 2, 4, 8, 16, 32, 64',
          },
        };
      case 't-shirt':
        return {
          label: 'T-Shirt Size Range',
          standard: {
            label: 'Standard Range',
            description: '-, XS, S, M, L, XL',
          },
          extended: {
            label: 'Extended Range',
            description: '-, XS, S, M, L, XL, XXL, XXXL',
          },
        };
      default:
        return null;
    }
  };

  const getEstimationDescription = (type: string, isExtended: boolean) => {
    switch (type) {
      case 'fibonacci':
        return isExtended
          ? 'Fibonacci sequence (0, 1, 2, 3, 5, 8, 13, 21)'
          : 'Fibonacci sequence (0, 1, 2, 3, 5, 8)';
      case 'linear':
        return isExtended
          ? 'Linear scale (0, 1, 2, 3, 4, 5, 6, 7)'
          : 'Linear scale (0, 1, 2, 3, 4, 5)';
      case 'exponential':
        return isExtended
          ? 'Powers of 2 (0, 1, 2, 4, 8, 16, 32, 64)'
          : 'Powers of 2 (0, 1, 2, 4, 8, 16)';
      case 't-shirt':
        return isExtended
          ? 'T-shirt sizes (-, XS, S, M, L, XL, XXL, XXXL)'
          : 'T-shirt sizes (-, XS, S, M, L, XL)';
      default:
        return 'No estimation configured';
    }
  };

  const handleConfirm = async () => {
    const actualEstimationType =
      selectedEstimationType === 'none' ? null : selectedEstimationType;

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards/${boardId}/estimation`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            estimation_type: actualEstimationType,
            extended_estimation: extendedEstimation,
            allow_zero_estimates: allowZeroEstimates,
            count_unestimated_issues: countUnestimatedIssues,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || 'Failed to update estimation type'
        );
      }

      toast.success('Estimation configured successfully');
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      console.error('Error updating estimation:', e);
      toast.error(e.message || 'Failed to update estimation settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px]">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-2.5 text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
              <Target className="h-4 w-4 text-dynamic-orange" />
            </div>
            <span>Configure Estimation for &quot;{boardName}&quot;</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
            <Label
              htmlFor="estimation-method"
              className="flex items-center gap-2 font-semibold text-foreground text-sm"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                <Calculator className="h-3.5 w-3.5 text-dynamic-orange" />
              </div>
              Estimation Method
            </Label>
            <Select
              value={selectedEstimationType}
              onValueChange={setSelectedEstimationType}
            >
              <SelectTrigger
                id="estimation-method"
                className="flex h-full w-full items-center justify-between text-left text-sm transition-all hover:border-dynamic-orange/50 hover:bg-dynamic-orange/5 [&>svg]:rotate-180 data-[state=open]:[&>svg]:rotate-0"
              >
                <SelectValue placeholder="Select estimation method" />
              </SelectTrigger>
              <SelectContent
                align="end"
                className="w-[var(--radix-select-trigger-width)]"
              >
                {estimationTypes.map((type) => (
                  <SelectItem
                    key={type.value}
                    value={type.value}
                    className="cursor-pointer"
                  >
                    <div className="py-2">
                      <div className="font-medium">{type.label}</div>
                      <div className="mt-1 text-muted-foreground text-sm">
                        {type.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedEstimationType && selectedEstimationType !== 'none' && (
            <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
              <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                  <BarChart3 className="h-3.5 w-3.5 text-dynamic-orange" />
                </div>
                {getRangeInfo(selectedEstimationType)?.label ||
                  'Estimation Range'}
              </Label>
              <div className="grid gap-3">
                <button
                  type="button"
                  className={`flex items-center justify-between rounded-lg border-2 p-4 text-left transition-colors ${
                    !extendedEstimation
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setExtendedEstimation(false)}
                >
                  <div className="space-y-1">
                    <div className="font-medium">
                      {getRangeInfo(selectedEstimationType)?.standard.label ||
                        'Standard Range'}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {getRangeInfo(selectedEstimationType)?.standard
                        .description || 'Standard values'}
                    </div>
                  </div>
                  <div
                    className={`h-4 w-4 rounded-full border-2 ${
                      !extendedEstimation
                        ? 'border-primary bg-primary'
                        : 'border-border'
                    }`}
                  >
                    {!extendedEstimation && (
                      <div className="h-full w-full scale-50 rounded-full bg-white" />
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  className={`flex items-center justify-between rounded-lg border-2 p-4 text-left transition-colors ${
                    extendedEstimation
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setExtendedEstimation(true)}
                >
                  <div className="space-y-1">
                    <div className="font-medium">
                      {getRangeInfo(selectedEstimationType)?.extended.label ||
                        'Extended Range'}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {getRangeInfo(selectedEstimationType)?.extended
                        .description || 'Extended values'}
                    </div>
                  </div>
                  <div
                    className={`h-4 w-4 rounded-full border-2 ${
                      extendedEstimation
                        ? 'border-primary bg-primary'
                        : 'border-border'
                    }`}
                  >
                    {extendedEstimation && (
                      <div className="h-full w-full scale-50 rounded-full bg-white" />
                    )}
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Estimation Configuration Options */}
          {selectedEstimationType && selectedEstimationType !== 'none' && (
            <div className="space-y-2.5 rounded-lg border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-3.5 shadow-sm">
              <Label className="flex items-center gap-2 font-semibold text-foreground text-sm">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-dynamic-orange/15">
                  <CheckSquare className="h-3.5 w-3.5 text-dynamic-orange" />
                </div>
                Estimation Options
              </Label>

              {/* Allow Zero Estimates Toggle */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background p-3.5 transition-all hover:border-primary/30">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="font-medium text-sm">
                    Allow zero estimates
                  </div>
                  <div className="text-muted-foreground text-xs leading-snug">
                    When enabled, issues can be estimated with zero points
                  </div>
                </div>
                <Switch
                  checked={allowZeroEstimates}
                  onCheckedChange={setAllowZeroEstimates}
                  className="shrink-0"
                />
              </div>

              {/* Count Unestimated Issues Toggle */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background p-3.5 transition-all hover:border-primary/30">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="font-medium text-sm">
                    Count unestimated issues
                  </div>
                  <div className="text-muted-foreground text-xs leading-snug">
                    When enabled, unestimated issues count as 1 estimate point.
                    When disabled, they count as 0
                  </div>
                </div>
                <Switch
                  checked={countUnestimatedIssues}
                  onCheckedChange={setCountUnestimatedIssues}
                  className="shrink-0"
                />
              </div>
            </div>
          )}

          {selectedEstimationType && selectedEstimationType !== 'none' && (
            <div className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-3.5 ring-1 ring-dynamic-orange/10">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-dynamic-orange">
                  <div className="h-2 w-2 rounded-full bg-white" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-semibold text-dynamic-orange text-sm">
                    Selected Configuration
                  </p>
                  <p className="text-muted-foreground text-xs leading-snug">
                    {getEstimationDescription(
                      selectedEstimationType,
                      extendedEstimation
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="sm:w-auto"
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  Update Estimation
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
