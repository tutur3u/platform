'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Calculator,
  Calendar,
  CheckSquare,
  Target,
  TrendingUp,
} from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
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
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  wsId: string;
  initialBoards: Partial<WorkspaceTaskBoard>[];
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

export default function TaskEstimatesClient({ wsId, initialBoards }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [boards, setBoards] =
    useState<Partial<WorkspaceTaskBoard>[]>(initialBoards);
  const [editingBoard, setEditingBoard] =
    useState<Partial<WorkspaceTaskBoard> | null>(null);
  const [selectedEstimationType, setSelectedEstimationType] =
    useState<string>('none');
  const [extendedEstimation, setExtendedEstimation] = useState<boolean>(false);
  const [allowZeroEstimates, setAllowZeroEstimates] = useState<boolean>(true);
  const [countUnestimatedIssues, setCountUnestimatedIssues] =
    useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getEstimationTypeInfo = (type: string | null) => {
    return (
      estimationTypes.find((et) => et.actualValue === type) ||
      estimationTypes[0]
    );
  };

  const getFibonacciDescription = (isExtended: boolean) => {
    return isExtended
      ? 'Fibonacci sequence (0, 1, 2, 3, 5, 8, 13, 21)'
      : 'Fibonacci sequence (0, 1, 2, 3, 5, 8)';
  };

  const getLinearDescription = (isExtended: boolean) => {
    return isExtended
      ? 'Linear scale (0, 1, 2, 3, 4, 5, 6, 7)'
      : 'Linear scale (0, 1, 2, 3, 4, 5)';
  };

  const getExponentialDescription = (isExtended: boolean) => {
    return isExtended
      ? 'Powers of 2 (0, 1, 2, 4, 8, 16, 32, 64)'
      : 'Powers of 2 (0, 1, 2, 4, 8, 16)';
  };

  const getTShirtDescription = (isExtended: boolean) => {
    return isExtended
      ? 'T-shirt sizes (-, XS, S, M, L, XL, XXL, XXXL)'
      : 'T-shirt sizes (-, XS, S, M, L, XL)';
  };

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

  const getEstimationDescription = (
    type: string | null,
    isExtended?: boolean
  ) => {
    if (!type || type === 'none') {
      return 'No estimation configured';
    }

    if (isExtended === undefined) {
      const typeInfo = estimationTypes.find((et) => et.actualValue === type);
      return typeInfo?.description || 'No estimation configured';
    }

    switch (type) {
      case 'fibonacci':
        return getFibonacciDescription(isExtended);
      case 'linear':
        return getLinearDescription(isExtended);
      case 'exponential':
        return getExponentialDescription(isExtended);
      case 't-shirt':
        return getTShirtDescription(isExtended);
      default:
        return 'No estimation configured';
    }
  };

  const handleUpdateEstimationType = async () => {
    if (!editingBoard) return;

    setIsSubmitting(true);
    try {
      // Convert 'none' back to null for the API
      const actualEstimationType =
        selectedEstimationType === 'none' ? null : selectedEstimationType;

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards/${editingBoard.id}/estimation`,
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
        throw new Error('Failed to update estimation type');
      }

      await queryClient.invalidateQueries({
        queryKey: ['board-config', editingBoard.id],
      });

      // Update local state
      setBoards((prev) =>
        prev.map((board) =>
          board.id === editingBoard.id
            ? {
                ...board,
                estimation_type: actualEstimationType as any,
                extended_estimation: extendedEstimation,
                allow_zero_estimates: allowZeroEstimates,
                count_unestimated_issues: countUnestimatedIssues,
              }
            : board
        )
      );

      setEditingBoard(null);
      toast.success('Estimation type updated successfully');
      router.refresh();
    } catch (error) {
      console.error('Error updating estimation type:', error);
      toast.error('Failed to update estimation type');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (board: Partial<WorkspaceTaskBoard>) => {
    setEditingBoard(board);
    // Convert null to 'none' for the select component
    const selectValue =
      board.estimation_type === null ? 'none' : board.estimation_type;
    setSelectedEstimationType(selectValue || 'none');
    setExtendedEstimation(board?.extended_estimation || false);
    setAllowZeroEstimates(board?.allow_zero_estimates || false);
    setCountUnestimatedIssues(board?.count_unestimated_issues || false);
  };

  const closeDialog = () => {
    setEditingBoard(null);
    setSelectedEstimationType('none');
    setExtendedEstimation(false);
    setAllowZeroEstimates(true);
    setCountUnestimatedIssues(false);
  };

  // Calculate statistics
  const stats = {
    totalBoards: boards.length,
    configuredBoards: boards.filter((b) => b.estimation_type).length,
    extendedBoards: boards.filter(
      (b) => b.estimation_type && b.extended_estimation
    ).length,
    estimationTypes: estimationTypes.slice(1).map((type) => ({
      ...type,
      count: boards.filter((b) => b.estimation_type === type.actualValue)
        .length,
      extendedCount: boards.filter(
        (b) => b.estimation_type === type.actualValue && b.extended_estimation
      ).length,
    })),
  };

  return (
    <div className="space-y-6">
      {/* Statistics Overview - Aligned with task card style */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="group overflow-hidden border-l-4 border-l-dynamic-blue/70 bg-dynamic-blue/5 p-4 transition-all hover:shadow-md hover:ring-1 hover:ring-primary/15">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-blue/15">
              <Target className="h-4 w-4 text-dynamic-blue" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-muted-foreground text-xs">
                Total Boards
              </p>
              <p className="font-bold text-2xl tabular-nums">
                {stats.totalBoards}
              </p>
            </div>
          </div>
        </Card>

        <Card className="group overflow-hidden border-l-4 border-l-dynamic-green/70 bg-dynamic-green/5 p-4 transition-all hover:shadow-md hover:ring-1 hover:ring-primary/15">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-green/15">
              <Calculator className="h-4 w-4 text-dynamic-green" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-muted-foreground text-xs">
                Configured
              </p>
              <p className="font-bold text-2xl tabular-nums">
                {stats.configuredBoards}
              </p>
            </div>
          </div>
        </Card>

        <Card className="group overflow-hidden border-l-4 border-l-dynamic-orange/70 bg-dynamic-orange/5 p-4 transition-all hover:shadow-md hover:ring-1 hover:ring-primary/15">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/15">
              <TrendingUp className="h-4 w-4 text-dynamic-orange" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-muted-foreground text-xs">
                Extended Range
              </p>
              <p className="font-bold text-2xl tabular-nums">
                {stats.extendedBoards}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Estimation Types Distribution - Aligned with task-edit-dialog sidebar style */}
      <Card className="overflow-hidden border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-6 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/15">
              <BarChart3 className="h-4 w-4 text-dynamic-orange" />
            </div>
            <h3 className="font-semibold text-base text-foreground">
              Estimation Methods Distribution
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.estimationTypes.map((type) => (
              <div
                key={type.value}
                className="group flex items-center justify-between rounded-lg border border-border/60 bg-background p-3.5 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{type.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {type.count} {type.count === 1 ? 'board' : 'boards'}
                    {type.extendedCount > 0 && (
                      <span className="text-dynamic-orange">
                        {' '}
                        ({type.extendedCount} ext)
                      </span>
                    )}
                  </p>
                </div>
                <Badge className={type.color} variant="secondary">
                  {type.count}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Boards List - Aligned with task card style */}
      <Card className="overflow-hidden border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-6 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/15">
                <Target className="h-4 w-4 text-dynamic-orange" />
              </div>
              <h3 className="font-semibold text-base text-foreground">
                Board Estimation Configuration
              </h3>
            </div>
            {boards.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {boards.length} {boards.length === 1 ? 'board' : 'boards'}
              </Badge>
            )}
          </div>

          {boards.length === 0 ? (
            <div className="rounded-lg bg-background py-12 text-center">
              <div className="mx-auto flex max-w-md flex-col items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                  <Calculator className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-semibold text-base">No boards found</h3>
                  <p className="text-muted-foreground text-sm">
                    Create some task boards to configure estimation methods
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {boards.map((board) => {
                const estimationInfo = getEstimationTypeInfo(
                  board?.estimation_type || null
                );
                return (
                  <div
                    key={board.id}
                    onClick={() => openEditDialog(board)}
                    className="group flex cursor-pointer flex-col gap-3 overflow-hidden rounded-lg border border-border/60 bg-background p-4 transition-all hover:border-primary/50 hover:shadow-md hover:ring-1 hover:ring-primary/15 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-sm">{board.name}</h4>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            className={
                              estimationInfo?.color ||
                              'bg-muted text-foreground'
                            }
                            variant="secondary"
                          >
                            {estimationInfo?.label || 'Unknown'}
                          </Badge>
                          {board.estimation_type &&
                            board.extended_estimation && (
                              <Badge
                                variant="outline"
                                className="border-dynamic-orange/50 text-[10px] text-dynamic-orange"
                              >
                                Extended
                              </Badge>
                            )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
                        {board.created_at && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {new Date(board.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                      {board.estimation_type && (
                        <p className="text-muted-foreground text-xs leading-snug">
                          {getEstimationDescription(
                            board.estimation_type,
                            board?.extended_estimation || false
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Edit Estimation Type Dialog - Aligned with task-edit-dialog style */}
      {editingBoard && (
        <Dialog open={!!editingBoard} onOpenChange={() => closeDialog()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-135">
            <DialogHeader className="border-b pb-4">
              <DialogTitle className="flex items-center gap-2.5 text-lg">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20">
                  <Target className="h-4 w-4 text-dynamic-orange" />
                </div>
                <span>Configure Estimation for "{editingBoard.name}"</span>
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
                    className="w-(--radix-select-trigger-width)"
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
                            {type.value === 'none'
                              ? type.description
                              : `${type.description}`}
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
                          {getRangeInfo(selectedEstimationType)?.standard
                            .label || 'Standard Range'}
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
                          {getRangeInfo(selectedEstimationType)?.extended
                            .label || 'Extended Range'}
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
                        When enabled, unestimated issues count as 1 estimate
                        point. When disabled, they count as 0
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
                          selectedEstimationType === 'none'
                            ? null
                            : selectedEstimationType,
                          selectedEstimationType !== 'none'
                            ? extendedEstimation
                            : undefined
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={closeDialog}
                  disabled={isSubmitting}
                  className="sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateEstimationType}
                  disabled={
                    isSubmitting ||
                    (!editingBoard?.estimation_type &&
                      selectedEstimationType === 'none')
                  }
                >
                  {isSubmitting ? (
                    <>
                      <Calculator className="mr-2 h-4 w-4 animate-spin" />
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
      )}
    </div>
  );
}
