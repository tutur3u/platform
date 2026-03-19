'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CalendarClock,
  History,
  Loader2,
  RotateCcw,
} from '@tuturuuu/icons';
import {
  getWorkspaceHabitScheduleHistory,
  revokeWorkspaceHabitSkip,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { invalidatePlanningQueries } from '@/lib/calendar/planning-query-client';

const DEFAULT_PAST_DAYS = 30;
const DEFAULT_FUTURE_DAYS = 30;

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

export function HabitScheduleHistoryPanel({
  wsId,
  habitId,
}: {
  wsId: string;
  habitId: string;
}) {
  const queryClient = useQueryClient();
  const range = getDefaultRange();
  const queryKey = [
    'habit-schedule-history',
    wsId,
    habitId,
    range.start,
    range.end,
  ];

  const historyQuery = useQuery({
    queryKey,
    queryFn: () =>
      getWorkspaceHabitScheduleHistory(wsId, habitId, range, {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      }),
    enabled: !!wsId && !!habitId,
    staleTime: 10_000,
  });

  const revokeSkipMutation = useMutation({
    mutationFn: async (occurrenceDate: string) =>
      revokeWorkspaceHabitSkip(
        wsId,
        habitId,
        { occurrenceDate },
        {
          fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
        }
      ),
    onMutate: async (occurrenceDate) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old?.entries) return old;
        return {
          ...old,
          entries: old.entries.map((entry: any) =>
            entry.occurrence_date === occurrenceDate
              ? {
                  ...entry,
                  status: 'to_be_scheduled',
                  canRevoke: false,
                }
              : entry
          ),
        };
      });
      return { previous };
    },
    onError: (_error, _occurrenceDate, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error('Failed to revoke skip');
    },
    onSuccess: async () => {
      await invalidatePlanningQueries(queryClient as any, wsId);
    },
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
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground text-xs">Scheduled</div>
          <div className="mt-1 font-medium text-sm">
            {summary?.scheduledCount ?? 0}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground text-xs">Completed</div>
          <div className="mt-1 font-medium text-sm">
            {summary?.completedCount ?? 0}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground text-xs">Skipped</div>
          <div className="mt-1 font-medium text-sm">
            {summary?.skippedCount ?? 0}
          </div>
        </div>
        <div className="rounded-lg border p-3">
          <div className="text-muted-foreground text-xs">To schedule</div>
          <div className="mt-1 font-medium text-sm">
            {summary?.toBeScheduledCount ?? 0}
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
          No habit history in this window.
        </div>
      ) : (
        <ScrollArea className="h-64 rounded-lg border">
          <div className="space-y-2 p-3">
            {entries.map((entry) => (
              <div
                key={`${entry.occurrence_date}-${entry.event_id ?? 'none'}`}
                className="rounded-lg border bg-background/70 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium text-sm">
                      {entry.start_at
                        ? new Date(entry.start_at).toLocaleString()
                        : entry.occurrence_date}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        {entry.status.replaceAll('_', ' ')}
                      </span>
                      {entry.event_id && <span>ID: {entry.event_id}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'capitalize',
                        entry.status === 'scheduled' &&
                          'border-dynamic-blue/40 text-dynamic-blue',
                        entry.status === 'completed' &&
                          'border-dynamic-green/40 text-dynamic-green',
                        entry.status === 'skipped' &&
                          'border-dynamic-red/40 text-dynamic-red',
                        entry.status === 'to_be_scheduled' &&
                          'border-dynamic-yellow/40 text-dynamic-yellow'
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {entry.status === 'skipped' ? (
                          <Ban className="h-3 w-3" />
                        ) : (
                          <History className="h-3 w-3" />
                        )}
                        {entry.status.replaceAll('_', ' ')}
                      </span>
                    </Badge>
                    {entry.canRevoke && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={revokeSkipMutation.isPending}
                        onClick={() =>
                          revokeSkipMutation.mutate(entry.occurrence_date)
                        }
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
