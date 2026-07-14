'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  generateTaskProgressCatchup,
  type TaskProgressCatchupPeriod,
} from '@tuturuuu/internal-api';
import {
  TASK_PROGRESS_AI_CATCHUPS_CONFIG_ID,
  TASK_PROGRESS_CATCHUP_CADENCE_CONFIG_ID,
  TASK_PROGRESS_SHOW_DECISIONS_CONFIG_ID,
} from '@tuturuuu/internal-api/users';
import { useUserWorkspaceConfig } from '@tuturuuu/ui/hooks/use-user-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

type IntelligenceView =
  | 'progress'
  | 'goals'
  | 'stats'
  | 'leaderboards'
  | 'import';

export function useTaskProgressIntelligence({
  view,
  wsId,
}: {
  view: IntelligenceView;
  wsId: string;
}) {
  const locale = useLocale();
  const t = useTranslations('task-progress');
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] =
    useState<TaskProgressCatchupPeriod>('weekly');
  const queryRoot = ['task-progress', wsId];
  const aiCatchupsConfig = useUserWorkspaceConfig(
    wsId,
    TASK_PROGRESS_AI_CATCHUPS_CONFIG_ID,
    'false'
  );
  const cadenceConfig = useUserWorkspaceConfig(
    wsId,
    TASK_PROGRESS_CATCHUP_CADENCE_CONFIG_ID,
    'weekly'
  );
  const showDecisionsConfig = useUserWorkspaceConfig(
    wsId,
    TASK_PROGRESS_SHOW_DECISIONS_CONFIG_ID,
    'true'
  );
  const aiEnabled = aiCatchupsConfig.data === 'true';
  const cadence = cadenceConfig.data ?? 'weekly';
  const period = cadence === 'monthly' ? 'monthly' : selectedPeriod;
  const queryKey = [...queryRoot, 'catchup', period, locale];
  const catchupQuery = useQuery({
    queryKey,
    queryFn: () => generateTaskProgressCatchup(wsId, { locale, period }),
    enabled:
      aiEnabled &&
      !cadenceConfig.isLoading &&
      (view === 'progress' || view === 'stats'),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const refreshCatchup = useMutation({
    mutationFn: () =>
      generateTaskProgressCatchup(wsId, { force: true, locale, period }),
    onSuccess: (response) => queryClient.setQueryData(queryKey, response),
    onError: () => toast.error(t('intelligence.catchup.error')),
  });

  return {
    aiEnabled,
    cadence,
    catchup: catchupQuery.data?.catchup,
    catchupError: catchupQuery.isError,
    catchupLoading: catchupQuery.isLoading && aiEnabled,
    onPeriodChange: setSelectedPeriod,
    onRefresh: () => refreshCatchup.mutate(),
    period,
    refreshing: refreshCatchup.isPending,
    showDecisions: showDecisionsConfig.data !== 'false',
  };
}
