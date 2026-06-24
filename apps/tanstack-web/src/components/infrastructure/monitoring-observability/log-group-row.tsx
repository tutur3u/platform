'use client';

import type { ObservabilityLogGroup } from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import {
  formatClientContext,
  formatDateTime,
  formatLatencyMs,
  formatUserContext,
  statusClass,
} from './formatters';

function levelClass(level: ObservabilityLogGroup['level']) {
  if (level === 'error') {
    return 'border-dynamic-red/35 bg-dynamic-red/10 text-dynamic-red';
  }

  if (level === 'warn') {
    return 'border-dynamic-orange/35 bg-dynamic-orange/10 text-dynamic-orange';
  }

  if (level === 'debug') {
    return 'border-dynamic-blue/35 bg-dynamic-blue/10 text-dynamic-blue';
  }

  return 'border-border bg-muted/30 text-muted-foreground';
}

export function LogGroupRow({
  expanded,
  group,
  onToggle,
  t,
}: {
  expanded: boolean;
  group: ObservabilityLogGroup;
  onToggle: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const context = group.route ?? group.requestId ?? group.source;
  const deploymentContext = [
    group.deploymentStamp,
    group.deploymentColor,
    formatLatencyMs(group.durationMs),
  ]
    .filter(Boolean)
    .join(' · ');
  const clientContext = formatClientContext(group);
  const userContext = formatUserContext(group);

  return (
    <article>
      <button
        aria-expanded={expanded}
        aria-label={expanded ? t('collapse') : t('expand')}
        className="grid w-full gap-3 px-3 py-3 text-left text-sm transition-colors hover:bg-muted/30 lg:grid-cols-[142px_84px_80px_minmax(220px,1fr)_170px_170px_88px]"
        onClick={onToggle}
        type="button"
      >
        <div className="font-mono text-muted-foreground text-xs">
          {formatDateTime(group.createdAt)}
        </div>
        <div>
          <Badge
            className={cn('uppercase', levelClass(group.level))}
            variant="outline"
          >
            {group.level}
          </Badge>
        </div>
        <div className={cn('font-mono text-xs', statusClass(group.status))}>
          {group.status ?? '-'}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{group.message}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            <span className="truncate font-mono">{context}</span>
            {group.eventCount > 1 ? (
              <Badge className="border-border bg-muted/30" variant="outline">
                {t('event_count', { count: group.eventCount })}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="truncate font-mono text-muted-foreground text-xs">
          {group.requestId ?? '-'}
        </div>
        <div className="truncate font-mono text-muted-foreground text-xs">
          {userContext || '-'}
        </div>
        <div className="text-muted-foreground text-xs uppercase">
          {group.source}
        </div>
      </button>
      {expanded ? (
        <div className="space-y-3 border-border/60 border-t bg-muted/10 px-3 py-3">
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
            <Meta
              label={t('first_event')}
              value={formatDateTime(group.firstEventAt)}
            />
            <Meta label={t('route')} value={group.route ?? '-'} />
            <Meta label={t('request_id')} value={group.requestId ?? '-'} />
            <Meta label={t('user')} value={userContext || '-'} />
            <Meta label={t('deployment')} value={deploymentContext || '-'} />
            {clientContext ? (
              <div className="sm:col-span-2 lg:col-span-5">
                <p className="text-muted-foreground">{t('client')}</p>
                <p className="truncate font-mono">{clientContext}</p>
              </div>
            ) : null}
          </div>
          {group.errorStack ? (
            <pre className="max-h-56 overflow-auto rounded-md border border-border bg-background p-3 text-xs leading-relaxed">
              {group.errorStack}
            </pre>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="truncate font-mono">{value}</p>
    </div>
  );
}
