'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calculator, Loader2, Save } from '@tuturuuu/icons';
import {
  updateWorkspaceTaskBoardEstimation,
  type WorkspaceTaskBoardDetail,
} from '@tuturuuu/internal-api/tasks';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

const NO_ESTIMATION = '__none__';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

export function BoardEstimationSettings({
  board,
  onRefresh,
  wsId,
}: {
  board: WorkspaceTaskBoardDetail;
  onRefresh: () => void;
  wsId: string;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [estimationType, setEstimationType] = useState(
    board.estimation_type ?? NO_ESTIMATION
  );
  const [extendedEstimation, setExtendedEstimation] = useState(
    board.extended_estimation ?? false
  );
  const [allowZeroEstimates, setAllowZeroEstimates] = useState(
    board.allow_zero_estimates ?? true
  );
  const [countUnestimatedIssues, setCountUnestimatedIssues] = useState(
    board.count_unestimated_issues ?? false
  );

  useEffect(() => {
    setEstimationType(board.estimation_type ?? NO_ESTIMATION);
    setExtendedEstimation(board.extended_estimation ?? false);
    setAllowZeroEstimates(board.allow_zero_estimates ?? true);
    setCountUnestimatedIssues(board.count_unestimated_issues ?? false);
  }, [
    board.allow_zero_estimates,
    board.count_unestimated_issues,
    board.estimation_type,
    board.extended_estimation,
  ]);

  const estimationOptions = useMemo(
    () => [
      {
        label: t('settings.tasks.estimation_none'),
        value: NO_ESTIMATION,
      },
      {
        description: '0, 1, 2, 3, 5, 8',
        label: t('settings.tasks.estimation_fibonacci'),
        value: 'fibonacci',
      },
      {
        description: '0, 1, 2, 3, 4, 5',
        label: t('settings.tasks.estimation_linear'),
        value: 'linear',
      },
      {
        description: '0, 1, 2, 4, 8, 16',
        label: t('settings.tasks.estimation_exponential'),
        value: 'exponential',
      },
      {
        description: 'XS, S, M, L, XL',
        label: t('settings.tasks.estimation_tshirt'),
        value: 't-shirt',
      },
    ],
    [t]
  );

  const updateMutation = useMutation({
    mutationFn: () =>
      updateWorkspaceTaskBoardEstimation(
        wsId,
        board.id,
        {
          allow_zero_estimates: allowZeroEstimates,
          count_unestimated_issues: countUnestimatedIssues,
          estimation_type:
            estimationType === NO_ESTIMATION
              ? null
              : (estimationType as
                  | 'exponential'
                  | 'fibonacci'
                  | 'linear'
                  | 't-shirt'),
          extended_estimation: extendedEstimation,
        },
        getBrowserInternalApiOptions()
      ),
    onSuccess: async () => {
      toast.success(t('settings.tasks.board_estimation_saved'));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['board-config', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['board-estimation-config', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-board', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-board-settings', wsId, board.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ['task-estimate-boards', wsId],
        }),
      ]);
      onRefresh();
    },
    onError: (error) => {
      toast.error(t('settings.tasks.board_estimation_update_failed'), {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const estimationEnabled = estimationType !== NO_ESTIMATION;

  return (
    <div className="space-y-5 rounded-lg border bg-background p-4">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 font-medium">
          <Calculator className="h-4 w-4" />
          {t('settings.tasks.estimates')}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t('settings.tasks.board_estimation_description')}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{t('settings.tasks.estimation_method')}</Label>
        <Combobox
          mode="single"
          onChange={(value) => {
            if (typeof value === 'string') setEstimationType(value);
          }}
          options={estimationOptions}
          placeholder={t('settings.tasks.estimation_none')}
          searchPlaceholder={t('common.search_tasks')}
          selected={estimationType}
        />
      </div>

      <div className="grid gap-3">
        <SwitchRow
          checked={extendedEstimation}
          disabled={!estimationEnabled}
          label={t('settings.tasks.extended_estimation')}
          onCheckedChange={setExtendedEstimation}
        />
        <SwitchRow
          checked={allowZeroEstimates}
          disabled={!estimationEnabled}
          label={t('settings.tasks.allow_zero_estimates')}
          onCheckedChange={setAllowZeroEstimates}
        />
        <SwitchRow
          checked={countUnestimatedIssues}
          disabled={!estimationEnabled}
          label={t('settings.tasks.count_unestimated_issues')}
          onCheckedChange={setCountUnestimatedIssues}
        />
      </div>

      <Button
        disabled={updateMutation.isPending}
        onClick={() => updateMutation.mutate()}
        type="button"
      >
        {updateMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        {t('settings.tasks.save_estimation')}
      </Button>
    </div>
  );
}

function SwitchRow({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 p-3">
      <span className="text-sm">{label}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
