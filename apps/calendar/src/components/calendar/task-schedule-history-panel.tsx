'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock3, History, Loader2, TimerReset } from '@tuturuuu/icons';
import { getWorkspaceTaskScheduleHistory } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';

const DEFAULT_PAST_DAYS = 30;
const DEFAULT_FUTURE_DAYS = 30;

function formatMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function getDefaultRange() {
  const now = new Date();
  const start = new Date(
    now.getTime() - DEFAULT_PAST_DAYS * 24 * 60 * 60 * 1000
  );
  const end = new Date(
    now.getTime() + DEFAULT_FUTURE_DAYS * 24 * 60 * 60 * 1000
  );

  return {
    start: start.toISOString().split('T')[0] ?? '',
    end: end.toISOString().split('T')[0] ?? '',
  };
}

export function TaskScheduleHistoryPanel({
  wsId,
  taskId,
}: {
  wsId: string;
  taskId: string;
}) {
  const range = getDefaultRange();
  const historyQuery = useQuery({
    queryKey: ['task-schedule-history', wsId, taskId, range.start, range.end],
    queryFn: () =>
      getWorkspaceTaskScheduleHistory(wsId, taskId, range, {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      }),
    enabled: !!wsId && !!taskId,
    staleTime: 10_000,
  });

  if (historyQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading history...
      </div>
    );
  }

  if (historyQuery.isError) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
        Failed to load schedule history.
      </div>
    );
  }

  const entries = historyQuery.data?.entries ?? [];
  const summary = historyQuery.data?.summary;

  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground text-xs">Scheduled</div>
          <div className="mt-1 font-medium text-sm">
            {formatMinutes(summary?.scheduledMinutes ?? 0)}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground text-xs">Target</div>
          <div className="mt-1 font-medium text-sm">
            {formatMinutes(summary?.totalMinutes ?? 0)}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground text-xs">Remaining</div>
          <div className="mt-1 font-medium text-sm">
            {formatMinutes(summary?.remainingMinutes ?? 0)}
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
          No scheduled history in this window.
        </div>
      ) : (
        <ScrollArea className="h-64 rounded-lg border">
          <div className="space-y-2 p-3">
            {entries.map((entry) => (
              <div
                key={`${entry.event_id ?? 'none'}-${entry.start_at ?? entry.date}`}
                className="rounded-lg border bg-background/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium text-sm">
                      {entry.start_at
                        ? new Date(entry.start_at).toLocaleString()
                        : entry.date}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatMinutes(entry.scheduled_minutes)}
                      </span>
                      {entry.event_id && <span>ID: {entry.event_id}</span>}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'capitalize',
                      entry.status === 'completed' &&
                        'border-dynamic-green/40 text-dynamic-green',
                      entry.status === 'scheduled' &&
                        'border-dynamic-blue/40 text-dynamic-blue',
                      entry.status === 'trimmed' &&
                        'border-dynamic-yellow/40 text-dynamic-yellow'
                    )}
                  >
                    {entry.status === 'trimmed' ? (
                      <span className="inline-flex items-center gap-1">
                        <TimerReset className="h-3 w-3" />
                        Trimmed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <History className="h-3 w-3" />
                        {entry.status}
                      </span>
                    )}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
