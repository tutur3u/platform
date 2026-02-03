'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Settings } from '@tuturuuu/icons';
import type { TimeTrackingCategory, Workspace } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SessionWithRelations } from '../types';
import { SimpleTimerControls } from './simple-timer-controls';

interface OverviewTimerProps {
  wsId: string;
  userId: string;
  categories: TimeTrackingCategory[];
  initialRunningSession: SessionWithRelations | null;
  workspace: Workspace;
}

export default function OverviewTimer({
  wsId,
  userId,
  categories,
  initialRunningSession,
  workspace,
}: OverviewTimerProps) {
  const tModes = useTranslations('time-tracker.modes');

  // Use React Query for running session - single source of truth
  const { data: currentSession } = useQuery<SessionWithRelations | null>({
    queryKey: ['running-time-session', wsId, userId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
      );
      if (!response.ok) throw new Error('Failed to fetch running session');
      const data = await response.json();
      return data.session ?? null;
    },
    refetchInterval: 30000,
    initialData: initialRunningSession,
    staleTime: 60000, // Don't refetch immediately after SSR
  });

  // Derive isRunning from query data
  const isRunning = useMemo(() => !!currentSession, [currentSession]);

  // Timer state - derived from currentSession, updated locally for smooth display
  const [elapsedTime, setElapsedTime] = useState(() => {
    if (!initialRunningSession) return 0;
    const elapsed = Math.floor(
      (Date.now() - new Date(initialRunningSession.start_time).getTime()) / 1000
    );
    return Math.max(0, elapsed);
  });

  // Sync elapsed time when currentSession changes from query
  useEffect(() => {
    if (currentSession) {
      const elapsed = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(currentSession.start_time).getTime()) / 1000
        )
      );
      setElapsedTime(elapsed);
    } else {
      setElapsedTime(0);
    }
  }, [currentSession]);

  // Timer effect
  useEffect(() => {
    if (isRunning && currentSession) {
      const interval = setInterval(() => {
        const elapsed = Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(currentSession.start_time).getTime()) / 1000
          )
        );
        setElapsedTime(elapsed);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isRunning, currentSession]);

  // API call helper
  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    []
  );

  return (
    <SimpleTimerControls
      wsId={wsId}
      currentSession={currentSession}
      elapsedTime={elapsedTime}
      isRunning={isRunning}
      categories={categories}
      apiCall={apiCall}
      workspace={workspace}
      currentUserId={userId}
      headerAction={
        <Link href={`/${wsId}/time-tracker/timer?mode=advanced`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Settings className="h-3.5 w-3.5" />
            {tModes('switchToAdvanced')}
            <ExternalLink className="h-3 w-3" />
          </Button>
        </Link>
      }
    />
  );
}
