'use client';

import { useQuery } from '@tanstack/react-query';
import { History, Loader2, RefreshCw } from '@tuturuuu/icons';
import { listWorkspaceTaskHistory } from '@tuturuuu/internal-api/tasks';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

function formatActivityToken(
  value: string | null | undefined,
  fallback: string
) {
  return (
    value
      ?.replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? fallback
  );
}

export function BoardActivitySettings({
  boardId,
  wsId,
}: {
  boardId: string;
  wsId: string;
}) {
  const t = useTranslations();
  const { data, error, isFetching, isLoading, refetch } = useQuery({
    queryKey: ['task-board-settings-activity', wsId, boardId],
    queryFn: () =>
      listWorkspaceTaskHistory(
        wsId,
        {
          boardId,
          page: 1,
          pageSize: 12,
        },
        getBrowserInternalApiOptions()
      ),
    enabled: Boolean(wsId && boardId),
    staleTime: 30_000,
  });

  const entries = data?.data ?? [];

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 font-medium">
            <History className="h-4 w-4" />
            {t('settings.tasks.board_activity')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('settings.tasks.board_activity_description')}
          </p>
        </div>
        <Button
          disabled={isFetching}
          onClick={() => void refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          {isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {t('common.refresh')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
          {t('settings.tasks.activity_load_failed')}
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
          {t('settings.tasks.no_board_activity')}
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {entries.map((entry) => (
            <div className="space-y-2 p-3" key={entry.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">
                    {entry.task_name}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {entry.user?.name ?? t('common.unknown')} ·{' '}
                    {new Intl.DateTimeFormat(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(entry.changed_at))}
                  </p>
                </div>
                <Badge variant="secondary">
                  {formatActivityToken(
                    entry.change_type,
                    t('settings.tasks.board_activity')
                  )}
                </Badge>
              </div>
              {entry.field_name && (
                <p className="text-muted-foreground text-xs">
                  {formatActivityToken(entry.field_name, entry.field_name)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
