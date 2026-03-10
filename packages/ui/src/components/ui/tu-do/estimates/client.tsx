'use client';

import {
  BarChart3,
  Calculator,
  Calendar,
  Target,
  TrendingUp,
} from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EditEstimationDialog } from './edit-estimation-dialog';
import {
  type UpdateTaskEstimateBoardInput,
  useTaskEstimates,
} from './use-task-estimates';

interface Props {
  wsId: string;
}

export default function TaskEstimatesClient({ wsId }: Props) {
  const t = useTranslations('task-estimates');
  const [editingBoard, setEditingBoard] =
    useState<Partial<WorkspaceTaskBoard> | null>(null);
  const {
    boards,
    isLoading,
    isError,
    error,
    isUpdating,
    updateEstimation,
    getEstimationDescription,
    getEstimationTypeInfo,
    getEstimationTypes,
    getRangeInfo,
    getTaskEstimateStats,
  } = useTaskEstimates(wsId);

  const estimationTypes = getEstimationTypes();
  const stats = getTaskEstimateStats(boards, estimationTypes);

  const getBoardName = (board: Partial<WorkspaceTaskBoard>) =>
    board.name?.trim() ? board.name : t('unnamed_board');

  const handleUpdate = async (input: UpdateTaskEstimateBoardInput) => {
    try {
      await updateEstimation(input);
      setEditingBoard(null);
      toast.success(t('toast.update_success'));
    } catch (mutationError) {
      console.error('Error updating estimation type:', mutationError);
      toast.error(t('toast.update_error'));
      throw mutationError;
    }
  };

  if (isLoading) {
    return (
      <Card className="border border-border/60 bg-background p-8 shadow-sm">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Calculator className="h-5 w-5 animate-spin" />
          <span>{t('dialog.updating')}</span>
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="border border-dynamic-red/30 bg-dynamic-red/5 p-8 shadow-sm">
        <div className="space-y-2 text-center">
          <p className="font-medium text-dynamic-red">
            {t('toast.update_error')}
          </p>
          <p className="text-muted-foreground text-sm">
            {error instanceof Error
              ? error.message
              : 'Failed to fetch task estimate boards'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="group overflow-hidden border-l-4 border-l-dynamic-blue/70 bg-dynamic-blue/5 p-4 transition-all hover:shadow-md hover:ring-1 hover:ring-primary/15">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-blue/15">
              <Target className="h-4 w-4 text-dynamic-blue" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-muted-foreground text-xs">
                {t('stats.total_boards')}
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
                {t('stats.configured')}
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
                {t('stats.extended_range')}
              </p>
              <p className="font-bold text-2xl tabular-nums">
                {stats.extendedBoards}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-6 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/15">
              <BarChart3 className="h-4 w-4 text-dynamic-orange" />
            </div>
            <h3 className="font-semibold text-base text-foreground">
              {t('estimation_methods_distribution')}
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
                    {type.count} {type.count === 1 ? t('board') : t('boards')}
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

      <Card className="overflow-hidden border border-border/60 bg-linear-to-br from-muted/30 to-muted/10 p-6 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-dynamic-orange/15">
                <Target className="h-4 w-4 text-dynamic-orange" />
              </div>
              <h3 className="font-semibold text-base text-foreground">
                {t('board_estimation_configuration')}
              </h3>
            </div>
            {boards.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {boards.length} {boards.length === 1 ? t('board') : t('boards')}
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
                  <h3 className="font-semibold text-base">
                    {t('no_boards_found')}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {t('no_boards_description')}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {boards.map((board) => {
                const estimationInfo = getEstimationTypeInfo(
                  estimationTypes,
                  board.estimation_type ?? null
                );
                const boardName = getBoardName(board);

                return (
                  <button
                    key={board.id}
                    type="button"
                    onClick={() => setEditingBoard(board)}
                    className="group flex w-full appearance-none flex-col gap-3 overflow-hidden rounded-lg border border-border/60 bg-background p-4 text-left transition-all hover:border-primary/50 hover:shadow-md hover:ring-1 hover:ring-primary/15 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-sm">{boardName}</h4>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            className={estimationInfo.color}
                            variant="secondary"
                          >
                            {estimationInfo.label}
                          </Badge>
                          {board.estimation_type &&
                            board.extended_estimation && (
                              <Badge
                                variant="outline"
                                className="border-dynamic-orange/50 text-[10px] text-dynamic-orange"
                              >
                                {t('extended_badge')}
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
                            estimationTypes,
                            board.estimation_type,
                            board.extended_estimation ?? false
                          )}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <EditEstimationDialog
        board={editingBoard}
        open={editingBoard !== null}
        isPending={isUpdating}
        estimationTypes={estimationTypes}
        getRangeInfo={getRangeInfo}
        getEstimationDescription={getEstimationDescription}
        onClose={() => setEditingBoard(null)}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
