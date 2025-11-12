'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Upload,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { useMemo, useState } from 'react';

export default function QuickCalendarToggle() {
  const {
    calendarConnections,
    updateCalendarConnection,
    syncStatus,
    syncToGoogle,
    syncToTuturuuu,
    isSyncing,
  } = useCalendarSync();
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [isOpen, setIsOpen] = useState(false);

  // Count enabled calendars
  const enabledCount = useMemo(
    () => calendarConnections.filter((c) => c.is_enabled).length,
    [calendarConnections]
  );

  // Don't show if no calendar connections
  if (calendarConnections.length === 0) {
    return null;
  }

  const handleToggle = async (connectionId: string, currentState: boolean) => {
    const newState = !currentState;
    const connection = calendarConnections.find((c) => c.id === connectionId);

    if (!connection) return;

    // Optimistically update the UI
    updateCalendarConnection(connectionId, newState);
    setTogglingIds((prev) => new Set(prev).add(connectionId));

    try {
      const response = await fetch('/api/v1/calendar/connections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: connectionId, isEnabled: newState }),
      });

      if (!response.ok) {
        // Revert on error
        updateCalendarConnection(connectionId, currentState);
        const data = await response.json();
        toast.error(data.error || 'Failed to update calendar visibility');
      }
    } catch (_error) {
      // Revert on error
      updateCalendarConnection(connectionId, currentState);
      toast.error('Failed to update calendar visibility');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Calendar className="h-4 w-4" />
          <span>Calendars</span>
          {enabledCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
              {enabledCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="font-medium text-sm leading-none">
              Visible Calendars
            </h4>
            <p className="text-muted-foreground text-xs">
              Toggle which calendars to show
            </p>
          </div>

          <div className="space-y-2">
            {calendarConnections.map((connection) => {
              const isEnabled = connection.is_enabled;
              const isToggling = togglingIds.has(connection.id);

              return (
                <button
                  type="button"
                  key={connection.id}
                  onClick={() => handleToggle(connection.id, isEnabled)}
                  disabled={isToggling}
                  className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {connection.color && (
                    <div
                      className="h-4 w-4 shrink-0 rounded-full border border-border"
                      style={{ backgroundColor: connection.color }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {connection.calendar_name}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isEnabled ? (
                      <Eye className="h-4 w-4 text-primary" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {calendarConnections.length > 0 && (
            <div className="space-y-2 border-border border-t pt-2">
              <p className="text-muted-foreground text-xs">
                {enabledCount} of {calendarConnections.length} calendar
                {calendarConnections.length !== 1 ? 's' : ''} visible
              </p>

              {/* Sync Status Indicator */}
              {syncStatus.state !== 'idle' && (
                <div
                  className={`flex items-center gap-2 rounded-md p-2 text-xs ${
                    syncStatus.state === 'syncing'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                      : syncStatus.state === 'success'
                        ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300'
                        : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                  }`}
                >
                  {syncStatus.state === 'syncing' && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  {syncStatus.state === 'success' && (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  {syncStatus.state === 'error' && (
                    <AlertCircle className="h-3 w-3" />
                  )}
                  <span className="flex-1 truncate">{syncStatus.message}</span>
                  {syncStatus.lastSyncTime && (
                    <span className="text-[10px] opacity-70">
                      {new Date(syncStatus.lastSyncTime).toLocaleTimeString(
                        [],
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )}
                    </span>
                  )}
                </div>
              )}

              {/* Sync Buttons */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncToTuturuuu()}
                  disabled={isSyncing}
                  className="flex-1 gap-2"
                >
                  {isSyncing &&
                  syncStatus.direction === 'google-to-tuturuuu' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  <span className="text-xs">From Google</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncToGoogle()}
                  disabled={isSyncing}
                  className="flex-1 gap-2"
                >
                  {isSyncing &&
                  syncStatus.direction === 'tuturuuu-to-google' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  <span className="text-xs">To Google</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
