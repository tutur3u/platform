'use client';

import { useCalendar } from '../../../../../hooks/use-calendar';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceCalendarGoogleToken } from '@tuturuuu/types/db';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Progress } from '@tuturuuu/ui/progress';
import { Check, ExternalLink, Link, Loader2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type SmartSchedulingData = {
  enableSmartScheduling: boolean;
  minimumMeetingBuffer: number; // in minutes
  preferredMeetingTimes: 'morning' | 'afternoon' | 'distributed';
  avoidBackToBackMeetings: boolean;
  maximumMeetingsPerDay: number;
  focusTimeBlocks: {
    enabled: boolean;
    duration: number; // in minutes
    frequency: 'daily' | 'weekly';
    preferredTime: 'morning' | 'afternoon';
  };
  productivityScore: number; // 0-100
};

export const defaultSmartSchedulingData: SmartSchedulingData = {
  enableSmartScheduling: true,
  minimumMeetingBuffer: 15,
  preferredMeetingTimes: 'afternoon',
  avoidBackToBackMeetings: true,
  maximumMeetingsPerDay: 5,
  focusTimeBlocks: {
    enabled: true,
    duration: 120,
    frequency: 'daily',
    preferredTime: 'morning',
  },
  productivityScore: 70,
};

type GoogleCalendarSettingsProps = {
  wsId: string;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken;
};

export function GoogleCalendarSettings({
  wsId,
  experimentalGoogleToken,
}: GoogleCalendarSettingsProps) {
  const router = useRouter();

  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(
    !!experimentalGoogleToken?.id
  );
  const [isGoogleAuthenticating, setIsGoogleAuthenticating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    status: 'idle' | 'success' | 'error' | 'no-changes';
    message?: string;
  }>({ status: 'idle' });
  const [syncProgress, setSyncProgress] = useState<{
    phase: 'fetch' | 'delete' | 'update' | 'insert' | 'complete';
    percentage: number;
    statusMessage: string;
    changesMade: boolean;
  }>({
    phase: 'complete',
    percentage: 100,
    statusMessage: '',
    changesMade: false,
  });
  const { toast } = useToast();
  const { syncGoogleCalendarNow, getEvents } = useCalendar();

  // Show connected events count
  const connectedEventsCount = getEvents().filter(
    (e) => e.google_event_id
  ).length;

  const handleGoogleAuth = async () => {
    if (!wsId) {
      toast({
        title: 'Error',
        description: 'Workspace ID is required to link Google Calendar',
        variant: 'destructive',
      });
      return;
    }

    setIsGoogleAuthenticating(true);
    try {
      const response = await fetch(`/api/v1/calendar/auth?wsId=${wsId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const { authUrl } = await response.json();
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating Google auth:', error);
      toast({
        title: 'Error',
        description: 'Failed to initiate Google authentication',
        variant: 'destructive',
      });
      setIsGoogleAuthenticating(false);
    }
  };

  const handleSyncNow = async () => {
    if (!experimentalGoogleToken) {
      toast({
        title: 'Error',
        description: 'You need to connect Google Calendar first',
        variant: 'destructive',
      });
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ status: 'idle' });
    setSyncProgress({
      phase: 'fetch',
      percentage: 0,
      statusMessage: 'Starting sync...',
      changesMade: false,
    });

    try {
      // Use the syncGoogleCalendarNow function from useCalendar hook with progress tracking
      const success = await syncGoogleCalendarNow(
        (progress: {
          phase: 'fetch' | 'delete' | 'update' | 'insert' | 'complete';
          current: number;
          total: number;
          changesMade: boolean;
          statusMessage?: string;
        }) => {
          // Calculate percentage based on phase and progress
          let percentage = 0;

          switch (progress.phase) {
            case 'fetch':
              percentage = (progress.current / progress.total) * 25; // First 25%
              break;
            case 'delete':
              percentage = 25 + (progress.current / progress.total) * 25; // 25-50%
              break;
            case 'update':
              percentage = 50 + (progress.current / progress.total) * 25; // 50-75%
              break;
            case 'insert':
              percentage = 75 + (progress.current / progress.total) * 20; // 75-95%
              break;
            case 'complete':
              percentage = 100; // Full completion
              break;
          }

          // Update progress state
          setSyncProgress({
            phase: progress.phase,
            percentage,
            statusMessage: progress.statusMessage || 'Processing...',
            changesMade: progress.changesMade,
          });
        }
      );

      if (success) {
        toast({
          title: 'Sync Complete',
          description:
            syncProgress.statusMessage || 'Calendar synced successfully',
        });

        // Update sync status
        setSyncStatus({
          status: 'success',
          message: 'Sync completed successfully',
        });

        // Update last sync time with more detailed format
        const now = new Date();
        setLastSyncTime(
          now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      } else if (
        syncProgress.phase === 'complete' &&
        !syncProgress.changesMade
      ) {
        toast({
          title: 'Sync Status',
          description: 'No changes detected or sync was not needed',
        });

        // Update sync status
        setSyncStatus({
          status: 'no-changes',
          message: 'No changes detected',
        });

        // Still update the last sync time to show the attempt was made
        const now = new Date();
        setLastSyncTime(
          now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      } else {
        // This might be an error state
        setSyncStatus({
          status: 'error',
          message: syncProgress.statusMessage || 'Sync may have had issues',
        });
      }
    } catch (error) {
      console.error('Error syncing with Google Calendar:', error);

      setSyncStatus({
        status: 'error',
        message: 'Sync failed. Please try again.',
      });

      toast({
        title: 'Sync Failed',
        description: 'Could not sync with Google Calendar. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!experimentalGoogleToken || !wsId) {
      return;
    }

    setIsDisconnecting(true);
    try {
      const supabase = createClient();

      const { error } = await supabase
        .from('calendar_auth_tokens')
        .delete()
        .eq('id', experimentalGoogleToken.id);

      if (error) {
        throw error;
      }

      toast({
        title: 'Disconnected',
        description: 'Google Calendar has been disconnected successfully',
      });

      setGoogleCalendarConnected(false);
      // Refresh the page to update the UI state
      router.refresh();
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
      toast({
        title: 'Error',
        description: 'Failed to disconnect Google Calendar',
        variant: 'destructive',
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const openGoogleCalendarSettings = () => {
    window.open(
      'https://calendar.google.com/calendar/u/0/r/settings',
      '_blank'
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Google Calendar Integration</CardTitle>
              <CardDescription>
                Connect and sync with your Google Calendar
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col space-y-4">
            {experimentalGoogleToken && googleCalendarConnected ? (
              <div className="space-y-4">
                <div className="flex items-start rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                  <Check className="mr-3 mt-0.5 h-5 w-5 text-green-600 dark:text-green-400" />
                  <div className="flex-1">
                    <h4 className="font-medium text-green-800 dark:text-green-300">
                      Connected to Google Calendar
                    </h4>
                    <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                      Your calendar is syncing with Google Calendar
                      {lastSyncTime && ` (Last synced: ${lastSyncTime})`}
                    </p>

                    {/* Add sync stats */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <div className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        {connectedEventsCount} synced events
                      </div>
                      {syncStatus.status !== 'idle' && (
                        <div
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            syncStatus.status === 'success'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : syncStatus.status === 'error'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          }`}
                        >
                          {syncStatus.message}
                        </div>
                      )}
                    </div>

                    {/* Add sync progress bar when syncing */}
                    {isSyncing && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-green-700 dark:text-green-400">
                            {syncProgress.statusMessage}
                          </span>
                          <span className="text-green-700 dark:text-green-400">
                            {Math.round(syncProgress.percentage)}%
                          </span>
                        </div>
                        <Progress
                          value={syncProgress.percentage}
                          className="h-1.5 w-full"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                  >
                    {isSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                    onClick={openGoogleCalendarSettings}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Google Calendar
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive text-destructive hover:bg-destructive/10 flex items-center gap-2"
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                  >
                    {isDisconnecting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link className="h-4 w-4" />
                    )}
                    {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Alert variant="default" className="bg-muted">
                  <AlertDescription>
                    Link your Google Calendar to automatically sync events and
                    use smart scheduling features.
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={handleGoogleAuth}
                  disabled={isGoogleAuthenticating}
                  className="flex items-center gap-2"
                >
                  {isGoogleAuthenticating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Link className="h-4 w-4" />
                      <span>Connect Google Calendar</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
