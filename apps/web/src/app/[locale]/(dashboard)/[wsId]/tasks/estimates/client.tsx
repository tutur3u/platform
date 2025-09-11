'use client';

import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  BarChart3,
  Calculator,
  Calendar,
  CheckSquare,
  Edit2,
  Target,
  TrendingUp,
} from '@tuturuuu/ui/icons';
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
  initialBoards: Partial<TaskBoard>[];
}

const estimationTypes = [
  {
    value: 'none' as const,
    actualValue: null,
    label: 'No Estimation',
    description: 'No estimation method configured',
    color: 'bg-gray-100 text-gray-700',
  },
  {
    value: 'fibonacci' as const,
    actualValue: 'fibonacci' as const,
    label: 'Fibonacci',
    description: 'Fibonacci sequence (configurable range)',
    color: 'bg-blue-100 text-blue-700',
  },
  {
    value: 'linear' as const,
    actualValue: 'linear' as const,
    label: 'Linear',
    description: 'Linear scale (configurable range)',
    color: 'bg-green-100 text-green-700',
  },
  {
    value: 'exponential' as const,
    actualValue: 'exponential' as const,
    label: 'Exponential',
    description: 'Powers of 2 (configurable range)',
    color: 'bg-purple-100 text-purple-700',
  },
  {
    value: 't-shirt' as const,
    actualValue: 't-shirt' as const,
    label: 'T-Shirt Sizes',
    description: 'Size scale (configurable range)',
    color: 'bg-orange-100 text-orange-700',
  },
];

export default function TaskEstimatesClient({ wsId, initialBoards }: Props) {
  const router = useRouter();
  const [boards, setBoards] = useState<Partial<TaskBoard>[]>(initialBoards);
  const [editingBoard, setEditingBoard] = useState<Partial<TaskBoard> | null>(
    null
  );
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
      ? 'Fibonacci sequence (0, 1, 1, 2, 3, 5, 8, 13, 21)'
      : 'Fibonacci sequence (0, 1, 1, 2, 3, 5, 8)';
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

  const openEditDialog = (board: Partial<TaskBoard>) => {
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
    totalTasks: boards.reduce((sum, board) => sum + (board.task_count || 0), 0),
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
      {/* Statistics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Target className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Total Boards</p>
              <p className="font-bold text-2xl">{stats.totalBoards}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2">
              <Calculator className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Configured</p>
              <p className="font-bold text-2xl">{stats.configuredBoards}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <CheckSquare className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Total Tasks</p>
              <p className="font-bold text-2xl">{stats.totalTasks}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-100 p-2">
              <TrendingUp className="h-4 w-4 text-orange-600" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Extended Range</p>
              <p className="font-bold text-2xl">{stats.extendedBoards}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Estimation Types Distribution */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <h3 className="font-semibold text-lg">
              Estimation Methods Distribution
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {stats.estimationTypes.map((type) => (
              <div
                key={type.value}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{type.label}</p>
                  <p className="text-muted-foreground text-sm">
                    {type.count} boards
                    {type.extendedCount > 0 && (
                      <span className="text-orange-600">
                        {' '}
                        ({type.extendedCount} extended)
                      </span>
                    )}
                  </p>
                </div>
                <Badge className={type.color}>{type.count}</Badge>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Boards List */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              <h3 className="font-semibold text-lg">
                Board Estimation Configuration
              </h3>
            </div>
          </div>

          {boards.length === 0 ? (
            <div className="py-8 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="rounded-full bg-muted p-4">
                  <Calculator className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">No boards found</h3>
                  <p className="text-muted-foreground">
                    Create some task boards to configure estimation methods
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {boards.map((board) => {
                const estimationInfo = getEstimationTypeInfo(
                  board?.estimation_type || null
                );
                return (
                  <div
                    key={board.id}
                    className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-medium">{board.name}</h4>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              estimationInfo?.color ||
                              'bg-gray-100 text-gray-700'
                            }
                          >
                            {estimationInfo?.label || 'Unknown'}
                          </Badge>
                          {board.estimation_type &&
                            board.extended_estimation && (
                              <Badge variant="secondary" className="text-xs">
                                Extended
                              </Badge>
                            )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-muted-foreground text-sm">
                        <div className="flex items-center gap-1">
                          <CheckSquare className="h-3 w-3" />
                          <span>{board.task_count || 0} tasks</span>
                        </div>
                        {board.created_at && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {new Date(board.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                      {estimationInfo?.value && (
                        <p className="text-muted-foreground text-sm">
                          {getEstimationDescription(
                            board?.estimation_type || null,
                            board?.extended_estimation || false
                          )}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(board)}
                    >
                      <Edit2 className="mr-2 h-4 w-4" />
                      Configure
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Edit Estimation Type Dialog */}
      {editingBoard && (
        <Dialog open={!!editingBoard} onOpenChange={() => closeDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Configure Estimation for "{editingBoard.name}"
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-3">
                <Label
                  htmlFor="estimation-method"
                  className="font-medium text-base"
                >
                  Estimation Method
                </Label>
                <Select
                  value={selectedEstimationType}
                  onValueChange={setSelectedEstimationType}
                >
                  <SelectTrigger id="estimation-method" className="h-auto">
                    <SelectValue placeholder="Select estimation method" />
                  </SelectTrigger>
                  <SelectContent>
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
                              : `${type.description} (range configurable below)`}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedEstimationType && selectedEstimationType !== 'none' && (
                <div className="space-y-3">
                  <Label className="font-medium text-base">
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
                <div className="space-y-4">
                  <Label className="font-medium text-base">
                    Estimation Options
                  </Label>

                  {/* Allow Zero Estimates Toggle */}
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-1">
                      <div className="font-medium">Allow zero estimates</div>
                      <div className="text-muted-foreground text-sm">
                        When enabled, issues can be estimated with zero points
                      </div>
                    </div>
                    <Switch
                      checked={allowZeroEstimates}
                      onCheckedChange={setAllowZeroEstimates}
                    />
                  </div>

                  {/* Count Unestimated Issues Toggle */}
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-1">
                      <div className="font-medium">
                        Count unestimated issues
                      </div>
                      <div className="text-muted-foreground text-sm">
                        When enabled, unestimated issues count as 1 estimate
                        point. When disabled, they count as 0
                      </div>
                    </div>
                    <Switch
                      checked={countUnestimatedIssues}
                      onCheckedChange={setCountUnestimatedIssues}
                    />
                  </div>
                </div>
              )}

              {selectedEstimationType && selectedEstimationType !== 'none' && (
                <div className="rounded-lg border bg-muted p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                      <div className="h-2 w-2 rounded-full bg-white" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-sm">
                        Selected Configuration
                      </p>
                      <p className="text-muted-foreground text-sm">
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

              <div className="flex gap-3 border-t pt-6">
                <Button
                  onClick={handleUpdateEstimationType}
                  disabled={isSubmitting}
                  className="flex-1"
                  size="lg"
                >
                  {isSubmitting ? 'Updating...' : 'Update Estimation'}
                </Button>
                <Button variant="outline" onClick={closeDialog} size="lg">
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
