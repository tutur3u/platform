'use client';

import {
  AlertCircle,
  Bug,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Eye,
  Loader2,
  Lock,
  MapPin,
  PlayCircle,
  Search,
  Unlock,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useCalendarSync } from '@tuturuuu/ui/hooks/use-calendar-sync';
import { toast } from '@tuturuuu/ui/sonner';
import { useEffect, useState } from 'react';

interface DebugLog {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: any;
}

interface SyncProgress {
  currentEvent: number;
  totalEvents: number;
  eventName: string;
  status: 'pending' | 'processing' | 'success' | 'error';
}

export default function SyncDebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [inspectedEvent, setInspectedEvent] = useState<any>(null);
  const { events, syncStatus, enabledCalendarIds, syncToGoogle, isSyncing } =
    useCalendarSync();

  // Listen for custom debug events
  useEffect(() => {
    const handleDebugLog = (event: CustomEvent<DebugLog>) => {
      setLogs((prev) => [event.detail, ...prev].slice(0, 100)); // Keep last 100 logs
    };

    const handleSyncProgress = (event: CustomEvent<SyncProgress>) => {
      setSyncProgress(event.detail);
    };

    window.addEventListener('calendar-debug-log' as any, handleDebugLog as any);
    window.addEventListener(
      'calendar-sync-progress' as any,
      handleSyncProgress as any
    );

    return () => {
      window.removeEventListener(
        'calendar-debug-log' as any,
        handleDebugLog as any
      );
      window.removeEventListener(
        'calendar-sync-progress' as any,
        handleSyncProgress as any
      );
    };
  }, []);

  // Reset progress when sync completes
  useEffect(() => {
    if (!isSyncing) {
      setSyncProgress(null);
    }
  }, [isSyncing]);

  const copyDebugInfo = () => {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      events: {
        total: events.length,
        withGoogleId: events.filter((e: any) => e.google_event_id).length,
        withoutGoogleId: events.filter((e: any) => !e.google_event_id).length,
        locked: events.filter((e: any) => e.locked).length,
      },
      syncStatus,
      enabledCalendars: enabledCalendarIds.size,
      recentLogs: logs.slice(0, 10),
      eventsWithoutGoogleId: events
        .filter((e: any) => !e.google_event_id)
        .map((e: any) => ({
          id: e.id,
          title: e.title,
          start_at: e.start_at,
          end_at: e.end_at,
          locked: e.locked,
          google_calendar_id: e.google_calendar_id,
        })),
    };

    navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
    toast.success('Debug info copied to clipboard');
  };

  const validateEvents = () => {
    const issues: string[] = [];
    const eventsToSync = events.filter((e: any) => !e.google_event_id);

    if (eventsToSync.length === 0) {
      issues.push('No events need syncing (all have google_event_id)');
    }

    eventsToSync.forEach((event: any) => {
      if (!event.start_at || !event.end_at) {
        issues.push(`Event "${event.title}" missing start/end dates`);
      }
      if (event.locked) {
        issues.push(`Event "${event.title}" is locked`);
      }
      if (new Date(event.end_at) <= new Date(event.start_at)) {
        issues.push(`Event "${event.title}" has invalid date range`);
      }
    });

    if (enabledCalendarIds.size === 0) {
      issues.push('No enabled calendars for sync');
    }

    if (issues.length > 0) {
      setLogs((prev) => [
        {
          id: `${Date.now()}-validation`,
          timestamp: new Date(),
          type: 'warning',
          message: 'Validation found issues',
          details: issues,
        },
        ...prev,
      ]);
    } else {
      setLogs((prev) => [
        {
          id: `${Date.now()}-validation`,
          timestamp: new Date(),
          type: 'success',
          message: `All ${eventsToSync.length} events ready to sync`,
          details: { eventsToSync: eventsToSync.length },
        },
        ...prev,
      ]);
    }

    return issues;
  };

  const inspectEvent = (event: any) => {
    setInspectedEvent(event);

    // Log detailed inspection
    setLogs((prev) => [
      {
        id: `${Date.now()}-inspect`,
        timestamp: new Date(),
        type: 'info',
        message: `Inspecting event: "${event.title}"`,
        details: {
          id: event.id,
          title: event.title,
          start_at: event.start_at,
          end_at: event.end_at,
          google_event_id: event.google_event_id,
          google_calendar_id: event.google_calendar_id,
          locked: event.locked,
          description: event.description,
          location: event.location,
        },
      },
      ...prev,
    ]);
  };

  const validateSingleEvent = (event: any) => {
    const issues: string[] = [];

    if (!event.start_at || !event.end_at) {
      issues.push('Missing start/end dates');
    }

    if (event.locked) {
      issues.push('Event is locked (cannot be synced)');
    }

    if (new Date(event.end_at) <= new Date(event.start_at)) {
      issues.push('End time is before or equal to start time');
    }

    if (!event.google_event_id && enabledCalendarIds.size === 0) {
      issues.push('No enabled calendars to sync to');
    }

    if (
      event.google_calendar_id &&
      !enabledCalendarIds.has(event.google_calendar_id)
    ) {
      issues.push(
        `Assigned calendar "${event.google_calendar_id}" is not enabled`
      );
    }

    return issues;
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed right-4 bottom-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500 text-white shadow-lg transition-transform hover:scale-110"
        title="Open Debug Panel"
      >
        <Bug className="h-5 w-5" />
      </button>
    );
  }

  const eventsWithGoogleId = events.filter((e: any) => e.google_event_id);
  const eventsWithoutGoogleId = events.filter((e: any) => !e.google_event_id);

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[500px] rounded-lg border border-border bg-background shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-border border-b bg-yellow-500/10 px-4 py-2">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4" />
          <span className="font-semibold text-sm">Calendar Sync Debug</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 border-border border-b p-3">
        <div className="rounded-md bg-blue-50 p-2 dark:bg-blue-950/30">
          <div className="text-[10px] text-muted-foreground">Total Events</div>
          <div className="font-bold text-lg">{events.length}</div>
        </div>
        <div className="rounded-md bg-green-50 p-2 dark:bg-green-950/30">
          <div className="text-[10px] text-muted-foreground">
            With Google ID
          </div>
          <div className="font-bold text-lg">{eventsWithGoogleId.length}</div>
        </div>
        <div className="rounded-md bg-orange-50 p-2 dark:bg-orange-950/30">
          <div className="text-[10px] text-muted-foreground">
            Without Google ID
          </div>
          <div className="font-bold text-lg">
            {eventsWithoutGoogleId.length}
          </div>
        </div>
        <div className="rounded-md bg-purple-50 p-2 dark:bg-purple-950/30">
          <div className="text-[10px] text-muted-foreground">
            Enabled Calendars
          </div>
          <div className="font-bold text-lg">{enabledCalendarIds.size}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 border-border border-b p-3">
        <Button
          size="sm"
          variant="outline"
          onClick={validateEvents}
          className="flex-1"
        >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Validate
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={copyDebugInfo}
          className="flex-1"
        >
          <Copy className="mr-1 h-3 w-3" />
          Copy Info
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => syncToGoogle()}
          disabled={isSyncing}
          className="flex-1"
        >
          {isSyncing ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <PlayCircle className="mr-1 h-3 w-3" />
          )}
          Test Sync
        </Button>
      </div>

      {/* Sync Progress */}
      {syncProgress && (
        <div className="border-border border-b bg-blue-50 p-3 dark:bg-blue-950/30">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold">
              Syncing: {syncProgress.currentEvent}/{syncProgress.totalEvents}
            </span>
            <span className="text-[10px]">{syncProgress.eventName}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{
                width: `${(syncProgress.currentEvent / syncProgress.totalEvents) * 100}%`,
              }}
            />
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px]">
            {syncProgress.status === 'success' && (
              <>
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                <span>Success</span>
              </>
            )}
            {syncProgress.status === 'error' && (
              <>
                <AlertCircle className="h-3 w-3 text-red-500" />
                <span>Error</span>
              </>
            )}
            {syncProgress.status === 'processing' && (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                <span>Processing...</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Event Inspector */}
      {inspectedEvent && (
        <div className="border-border border-b bg-indigo-50 p-3 dark:bg-indigo-950/30">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-[10px] text-muted-foreground">
              <Search className="h-3 w-3" />
              EVENT INSPECTOR
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setInspectedEvent(null)}
              className="h-5 w-5 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-2 rounded-md border border-indigo-200 bg-white p-2 dark:border-indigo-800 dark:bg-indigo-950/50">
            <div>
              <div className="font-semibold text-sm">
                {inspectedEvent.title}
              </div>
              <div className="text-[10px] text-muted-foreground">
                ID: {inspectedEvent.id}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <div>
                  <div className="font-semibold">Start</div>
                  <div className="text-muted-foreground">
                    {new Date(inspectedEvent.start_at).toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <div>
                  <div className="font-semibold">End</div>
                  <div className="text-muted-foreground">
                    {new Date(inspectedEvent.end_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1 text-[10px]">
              <div className="flex items-center gap-1">
                {inspectedEvent.locked ? (
                  <Lock className="h-3 w-3 text-red-500" />
                ) : (
                  <Unlock className="h-3 w-3 text-green-500" />
                )}
                <span className="font-semibold">Status:</span>
                <span
                  className={
                    inspectedEvent.locked ? 'text-red-500' : 'text-green-500'
                  }
                >
                  {inspectedEvent.locked ? 'Locked (Cannot sync)' : 'Unlocked'}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span className="font-semibold">Google Event ID:</span>
                <span className="text-muted-foreground">
                  {inspectedEvent.google_event_id || 'Not synced yet'}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span className="font-semibold">Google Calendar ID:</span>
                <span className="text-muted-foreground">
                  {inspectedEvent.google_calendar_id || 'Not assigned'}
                </span>
              </div>

              {inspectedEvent.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span className="font-semibold">Location:</span>
                  <span className="text-muted-foreground">
                    {inspectedEvent.location}
                  </span>
                </div>
              )}
            </div>

            {inspectedEvent.description && (
              <div className="text-[10px]">
                <div className="font-semibold">Description:</div>
                <div className="text-muted-foreground">
                  {inspectedEvent.description}
                </div>
              </div>
            )}

            {/* Validation Results */}
            {(() => {
              const issues = validateSingleEvent(inspectedEvent);
              return issues.length > 0 ? (
                <div className="rounded border border-red-200 bg-red-50 p-2 dark:border-red-800 dark:bg-red-950/50">
                  <div className="mb-1 flex items-center gap-1 font-semibold text-[10px] text-red-700 dark:text-red-300">
                    <AlertCircle className="h-3 w-3" />
                    Validation Issues
                  </div>
                  <ul className="list-inside list-disc text-[10px] text-red-600 dark:text-red-400">
                    {issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-950/50">
                  <div className="flex items-center gap-1 font-semibold text-[10px] text-green-700 dark:text-green-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Event is ready to sync
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Sync Status */}
      <div className="border-border border-b p-3">
        <div className="font-semibold text-[10px] text-muted-foreground">
          SYNC STATUS
        </div>
        <div
          className={`mt-1 rounded-md p-2 text-xs ${
            syncStatus.state === 'syncing'
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
              : syncStatus.state === 'success'
                ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300'
                : syncStatus.state === 'error'
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                  : 'bg-gray-50 text-gray-700 dark:bg-gray-950/30 dark:text-gray-300'
          }`}
        >
          <div className="font-semibold">
            {syncStatus.state.toUpperCase()}
            {syncStatus.direction && ` (${syncStatus.direction})`}
          </div>
          {syncStatus.message && (
            <div className="mt-1">{syncStatus.message}</div>
          )}
          {syncStatus.lastSyncTime && (
            <div className="mt-1 text-[10px] opacity-70">
              Last sync: {syncStatus.lastSyncTime.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {/* Diagnostics */}
      <div className="border-border border-b bg-slate-50 p-3 dark:bg-slate-950/30">
        <div className="mb-2 font-semibold text-[10px] text-muted-foreground">
          SYNC DIAGNOSTICS
        </div>
        <div className="space-y-2">
          {/* Locked Events Warning */}
          {(() => {
            const lockedEvents = events.filter((e: any) => e.locked);
            return lockedEvents.length > 0 ? (
              <div className="rounded border border-yellow-200 bg-yellow-50 p-2 dark:border-yellow-800 dark:bg-yellow-950/50">
                <div className="flex items-center gap-1 font-semibold text-[10px] text-yellow-700 dark:text-yellow-300">
                  <Lock className="h-3 w-3" />
                  {lockedEvents.length} Locked Events
                </div>
                <div className="mt-1 text-[10px] text-yellow-600 dark:text-yellow-400">
                  Locked events from Google cannot be synced back. They are
                  read-only.
                </div>
              </div>
            ) : null;
          })()}

          {/* No Enabled Calendars Warning */}
          {enabledCalendarIds.size === 0 && (
            <div className="rounded border border-red-200 bg-red-50 p-2 dark:border-red-800 dark:bg-red-950/50">
              <div className="flex items-center gap-1 font-semibold text-[10px] text-red-700 dark:text-red-300">
                <AlertCircle className="h-3 w-3" />
                No Enabled Calendars
              </div>
              <div className="mt-1 text-[10px] text-red-600 dark:text-red-400">
                Enable at least one calendar to sync events to Google.
              </div>
            </div>
          )}

          {/* Unassigned Events */}
          {(() => {
            const unassignedEvents = eventsWithoutGoogleId.filter(
              (e: any) => !e.google_calendar_id && !e.locked
            );
            return unassignedEvents.length > 0 ? (
              <div className="rounded border border-blue-200 bg-blue-50 p-2 dark:border-blue-800 dark:bg-blue-950/50">
                <div className="flex items-center gap-1 font-semibold text-[10px] text-blue-700 dark:text-blue-300">
                  <Calendar className="h-3 w-3" />
                  {unassignedEvents.length} Events Ready to Sync
                </div>
                <div className="mt-1 text-[10px] text-blue-600 dark:text-blue-400">
                  These events will be synced to the first enabled calendar.
                </div>
              </div>
            ) : null;
          })()}

          {/* All Synced */}
          {eventsWithoutGoogleId.length === 0 && events.length > 0 && (
            <div className="rounded border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-950/50">
              <div className="flex items-center gap-1 font-semibold text-[10px] text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-3 w-3" />
                All Events Synced
              </div>
              <div className="mt-1 text-[10px] text-green-600 dark:text-green-400">
                All events have Google Calendar IDs. They will be updated on
                next sync.
              </div>
            </div>
          )}

          {/* No Events */}
          {events.length === 0 && (
            <div className="rounded border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-950/50">
              <div className="flex items-center gap-1 font-semibold text-[10px] text-gray-700 dark:text-gray-300">
                <AlertCircle className="h-3 w-3" />
                No Events Found
              </div>
              <div className="mt-1 text-[10px] text-gray-600 dark:text-gray-400">
                No events in the current date range. Try changing the view or
                adding events.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Events Preview */}
      {isExpanded && (
        <div className="max-h-[200px] overflow-y-auto border-border border-b p-3">
          <div className="font-semibold text-[10px] text-muted-foreground">
            EVENTS WITHOUT GOOGLE ID ({eventsWithoutGoogleId.length})
          </div>
          <div className="mt-2 space-y-1">
            {eventsWithoutGoogleId.slice(0, 5).map((event: any) => (
              <button
                type="button"
                key={event.id}
                onClick={() => inspectEvent(event)}
                className="w-full rounded border border-orange-200 bg-orange-50 p-2 text-left text-xs transition-colors hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:hover:bg-orange-950/50"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{event.title}</div>
                  <Eye className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="text-[10px] text-muted-foreground">
                  ID: {event.id}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(event.start_at).toLocaleString()}
                </div>
                {event.locked && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
                    <Lock className="h-3 w-3" />
                    <span>Locked</span>
                  </div>
                )}
              </button>
            ))}
            {eventsWithoutGoogleId.length > 5 && (
              <div className="text-center text-[10px] text-muted-foreground">
                ... and {eventsWithoutGoogleId.length - 5} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logs */}
      {isExpanded && (
        <div className="max-h-[300px] overflow-y-auto p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-semibold text-[10px] text-muted-foreground">
              DEBUG LOGS ({logs.length})
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLogs([])}
              className="h-6 text-[10px]"
            >
              Clear
            </Button>
          </div>
          <div className="space-y-1">
            {logs.length === 0 ? (
              <div className="text-center text-muted-foreground text-xs">
                No logs yet. Perform a sync operation to see logs.
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`rounded border p-2 text-xs ${
                    log.type === 'error'
                      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
                      : log.type === 'warning'
                        ? 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300'
                        : log.type === 'success'
                          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300'
                          : 'border-border bg-muted'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="font-semibold">{log.message}</div>
                      {log.details && (
                        <pre className="mt-1 overflow-x-auto text-[10px]">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </div>
                    <div className="text-[10px] opacity-70">
                      {log.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
