'use client';

import { Settings, Timer, Zap } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { TimeTrackerData } from '../types';
import SimpleTimeTrackerContent from './simple-time-tracker-content';
import TimeTrackerContent from './time-tracker-content';

interface TimeTrackerWrapperProps {
  wsId: string;
  initialData: TimeTrackerData;
}

export default function TimeTrackerWrapper({
  wsId,
  initialData,
}: TimeTrackerWrapperProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Check URL parameter or localStorage for mode preference
  const [isAdvancedMode, setIsAdvancedMode] = useState(() => {
    // First check URL parameter
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

    toast.success('Switched to Advanced Mode', {
      description:
        'Access to Pomodoro timer, advanced settings, and more features',
      duration: 3000,
    });
  };

  const switchToSimple = () => {
    setIsAdvancedMode(false);
    // Update URL without causing navigation
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'simple');
    router.replace(url.pathname + url.search, { scroll: false });

    toast.success('Switched to Simple Mode', {
      description: 'Clean, focused time tracking experience',
      duration: 3000,
    });
  };

  if (isAdvancedMode) {
    return (
      <div className="space-y-6">
        {/* Mode Switcher */}
        <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 dark:border-orange-800 dark:from-orange-950/20 dark:to-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <span className="text-orange-800 dark:text-orange-200">
                  Advanced Mode
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={switchToSimple}
                className="border-orange-300 bg-white text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300 dark:hover:bg-orange-950/50"
              >
                <Zap className="mr-2 h-4 w-4" />
                Switch to Simple
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-orange-700 text-sm dark:text-orange-300">
              You're using the advanced timer with Pomodoro modes, break
              reminders, drag-and-drop, and detailed settings.
            </p>
          </CardContent>
        </Card>

        {/* Advanced Timer Component */}
        <TimeTrackerContent wsId={wsId} initialData={initialData} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 dark:border-blue-800 dark:from-blue-950/20 dark:to-indigo-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span className="text-blue-800 dark:text-blue-200">
                Simple Mode
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={switchToAdvanced}
              className="border-blue-300 bg-white text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
            >
              <Settings className="mr-2 h-4 w-4" />
              Switch to Advanced
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-blue-700 text-sm dark:text-blue-300">
            You're using the simplified timer focused on easy, quick time
            tracking. Switch to advanced mode for Pomodoro timers, break
            reminders, drag-and-drop, and detailed features.
          </p>
        </CardContent>
      </Card>

      {/* Simple Timer Component */}
      <SimpleTimeTrackerContent wsId={wsId} initialData={initialData} />
    </div>
  );
}
