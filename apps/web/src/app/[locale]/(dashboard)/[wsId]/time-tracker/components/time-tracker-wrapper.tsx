'use client';

import { useQuery } from '@tanstack/react-query';
import { Settings, Timer, Zap } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { TimeTrackerData } from '../types';
import SimpleTimeTrackerContent from './simple-time-tracker-content';
import TimeTrackerContent from './time-tracker-content';
import type { Workspace } from '@tuturuuu/types';

interface TimeTrackerWrapperProps {
  wsId: string;
  initialData: TimeTrackerData;
  workspace: Workspace;
}

export default function TimeTrackerWrapper({
  wsId,
  initialData,
  workspace,
}: TimeTrackerWrapperProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations('time-tracker.modes');

  const { data: currentUser, isLoading: isUserLoading } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  // Check URL parameter or localStorage for mode preference
  const [isAdvancedMode, setIsAdvancedMode] = useState(() => {
    // First check if taskSelect parameter is present - auto-switch to advanced mode
    const taskSelect = searchParams.get('taskSelect');
    if (taskSelect) return true;

    // Check URL parameter
    const urlMode = searchParams.get('mode');
    if (urlMode === 'advanced') return true;
    if (urlMode === 'simple') return false;

    // Then check localStorage
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('timer-mode-preference');
      return saved === 'advanced';
    }

    return false; // Default to simple mode
  });

  // Update URL and localStorage when mode changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'timer-mode-preference',
        isAdvancedMode ? 'advanced' : 'simple'
      );
    }
  }, [isAdvancedMode]);

  const switchToAdvanced = () => {
    setIsAdvancedMode(true);
    // Update URL without causing navigation
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'advanced');
    router.replace(url.pathname + url.search, { scroll: false });

    toast.success(t('switchedToAdvanced'), {
      description: t('advancedToastDescription'),
      duration: 3000,
    });
  };

  const switchToSimple = () => {
    setIsAdvancedMode(false);
    // Update URL without causing navigation
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'simple');
    router.replace(url.pathname + url.search, { scroll: false });

    toast.success(t('switchedToSimple'), {
      description: t('simpleToastDescription'),
      duration: 3000,
    });
  };

  if (isAdvancedMode) {
    return (
      <div className="space-y-6">
        {/* Mode Switcher */}
        <Card className="border-orange-200 bg-linear-to-r from-orange-50 to-amber-50 dark:border-orange-800 dark:from-orange-950/20 dark:to-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <span className="text-orange-800 dark:text-orange-200">
                  {t('advancedMode')}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={switchToSimple}
                className="border-orange-300 bg-white text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300 dark:hover:bg-orange-950/50"
              >
                <Zap className="mr-2 h-4 w-4" />
                {t('switchToSimple')}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-orange-700 text-sm dark:text-orange-300">
              {t('advancedDescription')}
            </p>
          </CardContent>
        </Card>

        {/* Advanced Timer Component */}
        <TimeTrackerContent
          wsId={wsId}
          initialData={initialData}
          currentUser={currentUser ?? null}
          isUserLoading={isUserLoading}
          workspace={workspace}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <Card className="border-blue-200 bg-linear-to-r from-blue-50 to-indigo-50 dark:border-blue-800 dark:from-blue-950/20 dark:to-indigo-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="text-blue-800 dark:text-blue-200">
                {t('simpleMode')}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={switchToAdvanced}
              className="border-blue-300 bg-white text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
            >
              <Settings className="mr-2 h-4 w-4" />
              {t('switchToAdvanced')}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-blue-700 text-sm dark:text-blue-300">
            {t('simpleDescription')}
          </p>
        </CardContent>
      </Card>

      {/* Simple Timer Component */}
      <SimpleTimeTrackerContent
        wsId={wsId}
        initialData={initialData}
        currentUser={currentUser ?? null}
        isUserLoading={isUserLoading}
        workspace={workspace}
      />
    </div>
  );
}
