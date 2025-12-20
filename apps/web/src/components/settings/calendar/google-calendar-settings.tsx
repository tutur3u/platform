'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Link,
  Loader2,
  RefreshCw,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  CalendarConnection,
  WorkspaceCalendarGoogleToken,
} from '@tuturuuu/types';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { useCalendar } from '@tuturuuu/ui/hooks/use-calendar';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Progress } from '@tuturuuu/ui/progress';
import { Switch } from '@tuturuuu/ui/switch';
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
  workspace?: { id: string } | null;
  experimentalGoogleToken?: WorkspaceCalendarGoogleToken | null;
  calendarConnections?: CalendarConnection[];
};

export function GoogleCalendarSettings({
  workspace,
  experimentalGoogleToken,
  calendarConnections = [],
}: GoogleCalendarSettingsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [googleCalendarConnected, setGoogleCalendarConnected] = useState(
    !!experimentalGoogleToken?.id
  );
  const [isGoogleAuthenticating, setIsGoogleAuthenticating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isFullSyncing, setIsFullSyncing] = useState(false);
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
  const { syncGoogleCalendarNow, getGoogleEvents } = useCalendar();
  const { setIsActiveSyncOn, isActiveSyncOn } = useCalendarSync();

  const [togglingCalendarIds, setTogglingCalendarIds] = useState<Set<string>>(
    new Set()
  );
  const [isImportingCalendars, setIsImportingCalendars] = useState(false);

  // Check if user is a Tuturuuu user (using TanStack Query)
  const { data: isTuturuuuUser = false } = useQuery({
    queryKey: ['is-tuturuuu-user'],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.email?.includes('@tuturuuu.com') || false;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - this rarely changes
  });

  // Show connected events count
  const connectedEventsCount = getGoogleEvents().length;

  const handleGoogleAuth = async () => {
    if (!workspace?.id) {
      toast({
        title: 'Error',
        description: 'Workspace ID is required to link Google Calendar',
        variant: 'destructive',
      });
      return;
    }

    setIsGoogleAuthenticating(true);
    try {
      const response = await fetch(
        `/api/v1/calendar/auth?wsId=${workspace.id}`,
        {
          method: 'GET',
        }
      );

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

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Sync failed. Please try again.';

      setSyncStatus({
        status: 'error',
        message: errorMessage,
      });

      toast({
        title: 'Sync Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleFullSync = async () => {
    if (!experimentalGoogleToken || !workspace?.id) {
      toast({
        title: 'Error',
        description: 'You need to connect Google Calendar first',
        variant: 'destructive',
      });
      return;
    }

    setIsFullSyncing(true);
    try {
      const response = await fetch('/api/v1/calendar/auth/full-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wsId: workspace.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to trigger full sync');
      }

      const result = await response.json();

      toast({
        title: 'Full Sync Completed',
        description: `Full sync completed successfully. Synced ${result.eventsSynced} events from Google Calendar.`,
      });
    } catch (error) {
      console.error('Error triggering full sync:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to trigger full sync',
        variant: 'destructive',
      });
    } finally {
      setIsFullSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!experimentalGoogleToken || !workspace?.id) {
      return;
    }

    setIsDisconnecting(true);
    try {
      // Use the API endpoint to disconnect
      const response = await fetch(
        `/api/v1/calendar/auth/tokens?wsId=${workspace.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to disconnect');
      }

      // Also delete all calendar connections for this workspace
      const supabase = createClient();
      await supabase
        .from('calendar_connections')
        .delete()
        .eq('ws_id', workspace.id);

      toast({
        title: 'Disconnected',
        description:
          'Google Calendar has been disconnected successfully. You can reconnect to use the new multi-calendar feature.',
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

  const handleImportCalendars = async () => {
    if (!workspace?.id) {
      toast({
        title: 'Error',
        description: 'No workspace selected',
        variant: 'destructive',
      });
      return;
    }

    setIsImportingCalendars(true);
    try {
      const response = await fetch('/api/v1/calendar/auth/import-calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wsId: workspace.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import calendars');
      }

      // Optimistically update the cache with the new connections
      queryClient.setQueryData(
        ['calendar-connections', workspace.id],
        data.connections
      );

      toast({
        title: 'Success',
        description: `Imported ${data.imported} calendar${data.imported !== 1 ? 's' : ''}. Total: ${data.total}`,
      });

      // Refresh RSC data in the background
      router.refresh();
    } catch (error) {
      console.error('Error importing calendars:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to import calendars',
        variant: 'destructive',
      });
    } finally {
      setIsImportingCalendars(false);
    }
  };

  const handleToggleCalendarVisibility = async (
    connectionId: string,
    currentState: boolean
  ) => {
    if (!workspace?.id) return;

    const newState = !currentState;
    setTogglingCalendarIds((prev) => new Set(prev).add(connectionId));

    // Save previous state for rollback
    const queryKey = ['calendar-connections', workspace.id];
    const previousConnections =
      queryClient.getQueryData<CalendarConnection[]>(queryKey);

    try {
      // Optimistically update the cache
      queryClient.setQueryData<CalendarConnection[]>(queryKey, (old) =>
        old?.map((conn) =>
          conn.id === connectionId ? { ...conn, is_enabled: newState } : conn
        )
      );

      const response = await fetch('/api/v1/calendar/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId, isEnabled: newState }),
      });

      if (!response.ok) {
        const data = await response.json();
        // Rollback on error
        queryClient.setQueryData(queryKey, previousConnections);
        toast({
          title: 'Error',
          description: data.error || 'Failed to update calendar visibility',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Success',
          description: `Calendar ${newState ? 'enabled' : 'disabled'} successfully`,
        });
        // Refresh RSC data in the background
        router.refresh();
      }
    } catch (_error) {
      // Rollback on error
      queryClient.setQueryData(queryKey, previousConnections);
      toast({
        title: 'Error',
        description: 'Failed to update calendar visibility',
        variant: 'destructive',
      });
    } finally {
      setTogglingCalendarIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
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
                  <Check className="mt-0.5 mr-3 h-5 w-5 text-green-600 dark:text-green-400" />
                  <div className="flex-1">
                    <h4 className="font-medium text-green-800 dark:text-green-300">
                      Connected to Google Calendar
                    </h4>
                    <p className="mt-1 text-green-700 text-sm dark:text-green-400">
                      Your calendar is syncing with Google Calendar
                      {lastSyncTime && ` (Last synced: ${lastSyncTime})`}
                    </p>

                    {/* Add sync stats */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <div className="rounded-full bg-green-100 px-2 py-1 font-medium text-green-800 text-xs dark:bg-green-900/30 dark:text-green-300">
                        {connectedEventsCount} synced events
                      </div>
                      {syncStatus.status !== 'idle' && (
                        <div
                          className={`rounded-full px-2 py-1 font-medium text-xs ${
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
                    onClick={handleFullSync}
                    disabled={isFullSyncing}
                  >
                    {isFullSyncing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {isFullSyncing ? 'Full Syncing...' : 'Full Sync'}
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
                    className="flex items-center gap-2 border-destructive text-destructive hover:bg-destructive/10"
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
                {isTuturuuuUser && (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={isActiveSyncOn}
                      onCheckedChange={setIsActiveSyncOn}
                    />
                    <span>Active Sync</span>
                  </div>
                )}
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

      {/* Calendar Connections List */}
      {experimentalGoogleToken && googleCalendarConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Connected Calendars</CardTitle>
            <CardDescription>
              {calendarConnections.length > 0
                ? 'Manage visibility of your connected Google calendars'
                : 'No calendars synced yet'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {calendarConnections.length > 0 ? (
              <>
                <div className="space-y-2">
                  {calendarConnections.map((connection) => {
                    const isEnabled = connection.is_enabled;
                    const isToggling = togglingCalendarIds.has(connection.id);

                    return (
                      <div
                        key={connection.id}
                        className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                      >
                        {/* Color indicator */}
                        {connection.color && (
                          <div
                            className="h-5 w-5 shrink-0 rounded-full border-2 border-border"
                            style={{ backgroundColor: connection.color }}
                          />
                        )}

                        {/* Calendar name */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-sm">
                            {connection.calendar_name}
                          </p>
                          {connection.calendar_id && (
                            <p className="truncate text-muted-foreground text-xs">
                              {connection.calendar_id}
                            </p>
                          )}
                        </div>

                        {/* Visibility toggle */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2"
                          onClick={() =>
                            handleToggleCalendarVisibility(
                              connection.id,
                              isEnabled
                            )
                          }
                          disabled={isToggling}
                        >
                          {isToggling ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isEnabled ? (
                            <>
                              <Eye className="h-4 w-4 text-primary" />
                              <span className="text-xs">Visible</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs">Hidden</span>
                            </>
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                <div className="mt-4 rounded-md bg-muted/50 p-3">
                  <p className="text-muted-foreground text-xs">
                    {calendarConnections.filter((c) => c.is_enabled).length} of{' '}
                    {calendarConnections.length} calendar
                    {calendarConnections.length !== 1 ? 's' : ''} visible
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <Alert>
                  <AlertDescription className="text-sm">
                    <p className="mb-3">
                      No calendars imported yet. Import your Google calendars to
                      manage their visibility and sync events.
                    </p>
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={handleImportCalendars}
                  disabled={isImportingCalendars}
                  className="w-full gap-2"
                >
                  {isImportingCalendars ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing Calendars...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Import Calendars from Google
                    </>
                  )}
                </Button>

                <p className="text-center text-muted-foreground text-xs">
                  This will fetch all your Google calendars and allow you to
                  manage which ones are visible in your workspace.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
