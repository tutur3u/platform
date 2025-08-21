'use client';

import { useCurrentUser } from '../hooks/use-current-user';
import { Button } from '@tuturuuu/ui/button';
import { Calendar, Clock, RefreshCw, Settings } from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Switch as SwitchComponent } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useRef, useState } from 'react';

export function SettingsContent() {
  const { userId: currentUserId, isLoading: isLoadingUser } = useCurrentUser();

  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const isMountedRef = useRef(true);

  // Heatmap settings state
  const [heatmapSettings, setHeatmapSettings] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('heatmap-settings');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // Fall through to default
        }
      }
    }
    return {
      viewMode: 'original' as 'original' | 'hybrid' | 'calendar-only',
      timeReference: 'smart' as 'relative' | 'absolute' | 'smart',
      showOnboardingTips: true,
    };
  });

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setLastRefresh(new Date());
    // Simulate loading for demo purposes
    setTimeout(() => {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }, 1000);
  }, []);

  if (isLoadingUser || !currentUserId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-sm text-muted-foreground">
            Loading settings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'space-y-6 duration-500 animate-in fade-in-50',
        isLoading && 'opacity-50'
      )}
    >
      {/* Enhanced Header */}
      <div className="space-y-6">
        {/* Main Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-gray-500 to-gray-700 shadow-lg">
                <Settings className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Timer Settings
                </h1>
                <p className="text-sm text-muted-foreground sm:text-base">
                  Customize your tracking experience ⚙️
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <span>Settings saved locally</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                <span>Real-time updates</span>
              </div>
            </div>

            {lastRefresh && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Main Settings Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Activity Heatmap Settings */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border bg-gradient-to-br from-white to-gray-50/30 p-6 shadow-sm dark:border-gray-800/60 dark:bg-gray-950/50 dark:from-gray-950/80 dark:to-gray-900/60">
              <div className="mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
                    <Calendar className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-100">
                      Activity Heatmap Display
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Customize how your activity heatmap is displayed
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="heatmap-view">Heatmap View Style</Label>
                    <Select
                      value={heatmapSettings.viewMode}
                      onValueChange={(
                        value: 'original' | 'hybrid' | 'calendar-only'
                      ) => {
                        const newSettings = {
                          ...heatmapSettings,
                          viewMode: value,
                        };
                        setHeatmapSettings(newSettings);
                        localStorage.setItem(
                          'heatmap-settings',
                          JSON.stringify(newSettings)
                        );
                      }}
                    >
                      <SelectTrigger id="heatmap-view">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="original">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-sm bg-blue-500" />
                            <span>Original Grid</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="hybrid">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-sm bg-green-500" />
                            <span>Hybrid (Year + Calendar)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="calendar-only">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-sm bg-purple-500" />
                            <span>Calendar Only</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {heatmapSettings.viewMode === 'original' &&
                        'GitHub-style grid view with day labels'}
                      {heatmapSettings.viewMode === 'hybrid' &&
                        'Year overview plus monthly calendar details'}
                      {heatmapSettings.viewMode === 'calendar-only' &&
                        'Traditional calendar interface'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="time-reference">Time Reference</Label>
                    <Select
                      value={heatmapSettings.timeReference}
                      onValueChange={(
                        value: 'relative' | 'absolute' | 'smart'
                      ) => {
                        const newSettings = {
                          ...heatmapSettings,
                          timeReference: value,
                        };
                        setHeatmapSettings(newSettings);
                        localStorage.setItem(
                          'heatmap-settings',
                          JSON.stringify(newSettings)
                        );
                      }}
                    >
                      <SelectTrigger id="time-reference">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="relative">
                          Relative (&quot;2 weeks ago&quot;)
                        </SelectItem>
                        <SelectItem value="absolute">
                          Absolute (&quot;Jan 15, 2024&quot;)
                        </SelectItem>
                        <SelectItem value="smart">
                          Smart (Both combined)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <SwitchComponent
                      id="onboarding-tips"
                      checked={heatmapSettings.showOnboardingTips}
                      onCheckedChange={(checked) => {
                        const newSettings = {
                          ...heatmapSettings,
                          showOnboardingTips: checked,
                        };
                        setHeatmapSettings(newSettings);
                        localStorage.setItem(
                          'heatmap-settings',
                          JSON.stringify(newSettings)
                        );
                      }}
                    />
                    <Label htmlFor="onboarding-tips" className="text-sm">
                      Show onboarding tips
                    </Label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-4 dark:bg-muted/20">
                    <h4 className="mb-2 text-sm font-medium">Preview</h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-gray-200 dark:bg-gray-700"></div>
                        <span>No activity</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-green-200 dark:bg-green-800"></div>
                        <span>Low activity</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-green-400 dark:bg-green-600"></div>
                        <span>Medium activity</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-sm bg-green-600 dark:bg-green-400"></div>
                        <span>High activity</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                    <h4 className="mb-2 text-sm font-medium text-blue-900 dark:text-blue-100">
                      Current Settings
                    </h4>
                    <div className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                      <p>View Mode: {heatmapSettings.viewMode}</p>
                      <p>Time Reference: {heatmapSettings.timeReference}</p>
                      <p>
                        Onboarding Tips:{' '}
                        {heatmapSettings.showOnboardingTips ? 'On' : 'Off'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Coming Soon Section */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border bg-gradient-to-br from-white to-gray-50/30 p-6 shadow-sm dark:border-gray-800/60 dark:bg-gray-950/50 dark:from-gray-950/80 dark:to-gray-900/60">
              <div className="mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg">
                    <Clock className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-100">
                      More Settings Coming Soon
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Additional customization options in development
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h4 className="mb-1 text-sm font-medium text-amber-900 dark:text-amber-100">
                    Timer Preferences
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Default session duration, break reminders, auto-pause
                  </p>
                </div>

                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
                    <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h4 className="mb-1 text-sm font-medium text-blue-900 dark:text-blue-100">
                    Default Categories
                  </h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Pre-configured categories for common activities
                  </p>
                </div>

                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/50">
                    <Settings className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <h4 className="mb-1 text-sm font-medium text-green-900 dark:text-green-100">
                    Productivity Goals
                  </h4>
                  <p className="text-xs text-green-700 dark:text-green-300">
                    Set daily/weekly time targets and notifications
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-4 dark:bg-muted/20">
                <p className="text-sm text-muted-foreground">
                  🔧 We're continuously improving the time tracker with more
                  customization options. These features will help you tailor the
                  experience to your workflow and preferences.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
