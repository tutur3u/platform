'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { stopTaskTimeTrackingSession } from './task-time-tracking-api';
import { withOptimisticallyClearedRunningTimeSession } from './task-time-tracking-cache';

interface RunningSession {
  id: string;
  ws_id?: string;
}

interface UseStopTaskTimerOptions {
  session: RunningSession | null | undefined;
  taskName: string;
  workspaceId: string;
  onStopped?: () => void;
}

export function useStopTaskTimer({
  session,
  taskName,
  workspaceId,
  onStopped,
}: UseStopTaskTimerOptions) {
  const queryClient = useQueryClient();
  const t = useTranslations('common');

  return useMutation({
    mutationFn: async () => {
      if (!session) throw new Error(t('please_try_again_later'));
      const sessionWorkspaceId = session.ws_id ?? workspaceId;

      try {
        await withOptimisticallyClearedRunningTimeSession(
          queryClient,
          session.id,
          () => stopTaskTimeTrackingSession(sessionWorkspaceId, session.id)
        );
        onStopped?.();
        void queryClient.invalidateQueries({
          queryKey: ['time-tracking-sessions', sessionWorkspaceId],
        });
        void queryClient.invalidateQueries({
          queryKey: ['running-time-session'],
        });
        toast.success(t('timer_stopped'), {
          description: t('timer_stopped_for', { name: taskName }),
        });
      } catch (error) {
        toast.error(t('failed_to_stop_timer'), {
          description:
            error instanceof Error
              ? error.message
              : t('please_try_again_later'),
        });
        throw error;
      }
    },
  });
}
