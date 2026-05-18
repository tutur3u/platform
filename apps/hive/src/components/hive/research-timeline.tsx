'use client';

import { Download } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  useHiveResearchSessions,
  useHiveTimeline,
} from '@/hooks/use-hive-data';
import {
  formatTimelineTime,
  getTimelineIcon,
  getTimelineItemDetails,
  getTimelineItemTitle,
} from './research-timeline-items';

type ResearchTimelineProps = {
  onClose: () => void;
  serverId: string | null;
};

export function ResearchTimeline({ onClose, serverId }: ResearchTimelineProps) {
  const t = useTranslations('studio.timeline');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sessionsQuery = useHiveResearchSessions(serverId, true);
  const [sessionId, setSessionId] = useState<string>('all');
  const filters = useMemo(
    () => ({
      limit: 240,
      researchSessionId: sessionId === 'all' ? null : sessionId,
    }),
    [sessionId]
  );
  const timelineQuery = useHiveTimeline(serverId, true, filters);
  const items = timelineQuery.data?.items ?? [];
  const activeSession = sessionsQuery.data?.activeSession ?? null;
  const exportSessionId = sessionId === 'all' ? activeSession?.id : sessionId;

  return (
    <section className="flex h-full min-h-0 flex-col bg-background/95 text-foreground backdrop-blur-xl">
      <header className="space-y-3 border-border border-b p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-dynamic-green text-xs uppercase">
              {t('eyebrow')}
            </p>
            <h2 className="font-semibold text-lg">{t('title')}</h2>
          </div>
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            {t('close')}
          </Button>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Select onValueChange={setSessionId} value={sessionId}>
            <SelectTrigger aria-label={t('session_filter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('all_sessions')}</SelectItem>
              {(sessionsQuery.data?.sessions ?? []).map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {session.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            asChild
            disabled={!serverId || !exportSessionId}
            size="icon"
            type="button"
            variant="outline"
          >
            <a
              aria-label={t('export_json')}
              href={
                serverId && exportSessionId
                  ? `/api/v1/hive/servers/${serverId}/research-sessions/${exportSessionId}/export`
                  : '#'
              }
            >
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!serverId ? (
          <p className="text-muted-foreground text-sm">{t('no_server')}</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {timelineQuery.isLoading ? t('loading') : t('empty')}
          </p>
        ) : (
          <ol className="space-y-2">
            {items.map((item) => {
              const Icon = getTimelineIcon(item);
              const expanded = expandedId === item.id;
              const details = getTimelineItemDetails(item);

              return (
                <li
                  className="rounded-lg border border-border bg-muted/20"
                  key={`${item.kind}:${item.id}`}
                >
                  <button
                    className="flex w-full items-start justify-between gap-3 p-3 text-left"
                    onClick={() =>
                      setExpandedId((current) =>
                        current === item.id ? null : item.id
                      )
                    }
                    type="button"
                  >
                    <span className="flex min-w-0 gap-2">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-green" />
                      <span className="min-w-0">
                        <span className="line-clamp-2 font-medium text-sm">
                          {getTimelineItemTitle(item, t('unknown_npc'))}
                        </span>
                        <span className="mt-1 block text-muted-foreground text-xs">
                          {item.kind}
                          {'researchSessionId' in item && item.researchSessionId
                            ? ` · ${item.researchSessionId.slice(0, 8)}`
                            : ''}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {formatTimelineTime(item.createdAt)}
                    </span>
                  </button>
                  {expanded ? (
                    <div className="grid gap-2 border-border border-t p-3 text-xs">
                      <pre className="max-h-36 overflow-auto rounded-md bg-background p-2 text-muted-foreground">
                        {JSON.stringify(details.input, null, 2)}
                      </pre>
                      <pre className="max-h-44 overflow-auto rounded-md bg-background p-2 text-muted-foreground">
                        {JSON.stringify(details.output, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
