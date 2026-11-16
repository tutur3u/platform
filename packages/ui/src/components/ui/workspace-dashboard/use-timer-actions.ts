'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  pauseCurrentUserTimeTrackingSession,
  stopCurrentUserTimeTrackingSession,
} from '@tuturuuu/internal-api/time-tracking';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

type TimerAction = 'pause' | 'stop';

/**
 * Pauses or stops the viewer's running session through the existing session
 * route (it only accepts the session owner), then refreshes the dashboard's
 * time reads and any other running-timer views on the page.
 */
export function useTimerActions(wsId: string) {
  const t = useTranslations('dashboard.overview');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ action, sessionId }: { action: TimerAction; sessionId: string }) =>
      action === 'stop'
        ? stopCurrentUserTimeTrackingSession(wsId, sessionId)
        : pauseCurrentUserTimeTrackingSession(wsId, sessionId),
    onSuccess: (_result, { action }) =>
      toast.success(action === 'stop' ? t('timer_stopped') : t('timer_paused')),
    onError: () => toast.error(t('timer_action_failed')),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ['workspace-dashboard', wsId, 'time'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });
    },
  });
}
