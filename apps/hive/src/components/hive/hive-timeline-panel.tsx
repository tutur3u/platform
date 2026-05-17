'use client';

import {
  Bot,
  Clock,
  Coins,
  MessageSquareText,
  Sparkles,
} from '@tuturuuu/icons';
import type {
  HiveTimelineInteractionItem,
  HiveTimelineRunItem,
} from '@tuturuuu/internal-api/hive';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useHiveTimeline } from '@/hooks/use-hive-data';

type HiveTimelinePanelProps = {
  onExit: () => void;
  serverId: string | null;
};

type TimelineFilter = 'all' | 'autonomous' | 'events' | 'runs';

function asText(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function getRunTitle(item: HiveTimelineRunItem) {
  const decision = item.outputDecision;
  const spokenText = asText(decision.spokenText);
  const summary = asText(decision.conversationSummary);
  return spokenText ?? summary ?? item.promptMode;
}

function getInteractionTitle(item: HiveTimelineInteractionItem) {
  const firstRun = item.runs[0];
  if (!firstRun) return item.trigger;
  return (
    asText(firstRun.outputDecision.conversationSummary) ?? getRunTitle(firstRun)
  );
}

function renderRunBadges(
  item: Pick<
    HiveTimelineInteractionItem | HiveTimelineRunItem,
    'creditsDeducted' | 'interactionId' | 'llmModel' | 'llmProvider' | 'trigger'
  >,
  deterministicLabel: string
) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1">
        <Bot className="h-3.5 w-3.5" />
        {item.llmModel ?? item.llmProvider ?? deterministicLabel}
      </span>
      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/30 px-2 py-1">
        <Coins className="h-3.5 w-3.5" />
        {item.creditsDeducted.toFixed(3)}
      </span>
      <span className="rounded-md border border-border bg-muted/30 px-2 py-1">
        {item.trigger}
      </span>
      {item.interactionId ? (
        <span className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono">
          {item.interactionId.slice(0, 8)}
        </span>
      ) : null}
    </div>
  );
}

export function HiveTimelinePanel({
  onExit,
  serverId,
}: HiveTimelinePanelProps) {
  const t = useTranslations('studio.timeline');
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const timelineQuery = useHiveTimeline(serverId, true);
  const items = timelineQuery.data?.items ?? [];
  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (filter === 'all') return true;
        if (filter === 'events') return item.kind === 'event';
        if (filter === 'runs') return item.kind !== 'event';
        return item.kind !== 'event' && item.autonomous;
      }),
    [filter, items]
  );

  return (
    <div className="h-full overflow-hidden bg-background text-foreground">
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-border border-b px-6 py-4">
          <div>
            <p className="text-dynamic-green text-xs uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="font-semibold text-2xl">{t('title')}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'runs', 'autonomous', 'events'] as const).map((value) => (
              <button
                aria-pressed={filter === value}
                className={[
                  'rounded-md border px-3 py-2 font-medium text-xs transition',
                  filter === value
                    ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                ].join(' ')}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {t(`filter_${value}`)}
              </button>
            ))}
            <Button onClick={onExit} size="sm" type="button" variant="outline">
              {t('back_to_world')}
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {!serverId ? (
            <p className="text-muted-foreground text-sm">{t('no_server')}</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {timelineQuery.isLoading ? t('loading') : t('empty')}
            </p>
          ) : (
            <ol className="space-y-3">
              {visibleItems.map((item) => {
                if (item.kind === 'event') {
                  return (
                    <li
                      className="rounded-lg border border-border bg-muted/20 p-4"
                      key={`event-${item.id}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-dynamic-blue" />
                          <p className="font-medium text-sm">
                            {item.eventType}
                          </p>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {formatTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-muted-foreground text-xs">
                        {t('revision', { revision: item.revision })}
                      </p>
                    </li>
                  );
                }

                if (item.kind === 'interaction') {
                  return (
                    <li
                      className="rounded-lg border border-border bg-background p-4 shadow-sm"
                      key={`interaction-${item.id}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {item.autonomous ? (
                              <Sparkles className="h-4 w-4 text-dynamic-green" />
                            ) : (
                              <MessageSquareText className="h-4 w-4 text-dynamic-purple" />
                            )}
                            <p className="truncate font-medium text-sm">
                              {item.npcName ?? t('unknown_npc')}
                              {item.targetNpcName
                                ? ` -> ${item.targetNpcName}`
                                : ''}
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-6">
                            {getInteractionTitle(item)}
                          </p>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {formatTime(item.createdAt)}
                        </span>
                      </div>
                      <ol className="mt-3 space-y-2">
                        {item.runs.map((run) => (
                          <li
                            className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs"
                            key={run.id}
                          >
                            <span className="font-medium">
                              {run.npcName ?? run.npcId}
                            </span>
                            <span className="text-muted-foreground">
                              {' '}
                              {getRunTitle(run)}
                            </span>
                          </li>
                        ))}
                      </ol>
                      {renderRunBadges(item, t('deterministic'))}
                    </li>
                  );
                }

                return (
                  <li
                    className="rounded-lg border border-border bg-background p-4 shadow-sm"
                    key={`run-${item.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {item.autonomous ? (
                            <Sparkles className="h-4 w-4 text-dynamic-green" />
                          ) : (
                            <MessageSquareText className="h-4 w-4 text-dynamic-purple" />
                          )}
                          <p className="truncate font-medium text-sm">
                            {item.npcName ?? item.npcId}
                            {item.targetNpcName
                              ? ` -> ${item.targetNpcName}`
                              : ''}
                          </p>
                        </div>
                        <p className="mt-2 text-sm leading-6">
                          {getRunTitle(item)}
                        </p>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {formatTime(item.createdAt)}
                      </span>
                    </div>
                    {renderRunBadges(item, t('deterministic'))}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
