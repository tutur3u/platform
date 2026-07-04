'use client';

import { ChevronDown, ChevronRight } from '@tuturuuu/icons';
import type {
  ObservabilityLogFacet,
  ObservabilityLogGroup,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

function formatTime(value: number | null | undefined) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
  }).format(value);
}

function formatDuration(value: number | null | undefined) {
  if (value == null) {
    return null;
  }

  return value < 1000
    ? `${Math.round(value)}ms`
    : `${(value / 1000).toFixed(1)}s`;
}

function formatClientContext({
  ipAddress,
  userAgent,
}: {
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return [ipAddress, userAgent].filter(Boolean).join(' · ');
}

function formatUserContext({
  userEmail,
  userId,
}: {
  userEmail?: string | null;
  userId?: string | null;
}) {
  return userEmail ?? userId ?? '';
}

function statusClass(status: number | null | undefined) {
  if (status == null) {
    return 'text-muted-foreground';
  }

  if (status >= 500) {
    return 'text-dynamic-red';
  }

  if (status >= 400) {
    return 'text-dynamic-orange';
  }

  if (status >= 300) {
    return 'text-dynamic-blue';
  }

  return 'text-dynamic-green';
}

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

export function selectClassName() {
  return 'h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-dynamic-blue/35';
}

export function countByValue(facets: ObservabilityLogFacet[]) {
  return new Map(facets.map((facet) => [facet.value, facet.count]));
}

function hasMetadata(metadata: Record<string, unknown>) {
  return Object.keys(metadata).length > 0;
}

function metadataJson(metadata: Record<string, unknown>) {
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return null;
  }
}

export function facetOptionLabel(facet: ObservabilityLogFacet) {
  return `${facet.value} (${facet.count})`;
}

export function getStatusOptions(facets: ObservabilityLogFacet[]) {
  const values = new Set(['5xx', '4xx', '3xx', '2xx']);
  facets.forEach((facet) => {
    values.add(facet.value);
  });
  return [...values];
}

function LogDetailPre({
  children,
  label,
}: {
  children: string;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted/20 p-3 text-xs leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

export function LogGroupRow({
  expanded,
  group,
  onToggle,
}: {
  expanded: boolean;
  group: ObservabilityLogGroup;
  onToggle: () => void;
}) {
  const t = useTranslations('blue-green-monitoring.observability.logs_panel');
  const context = group.route ?? group.requestId ?? group.source;
  const deploymentContext = [
    group.deploymentStamp,
    group.deploymentColor,
    formatDuration(group.durationMs),
  ]
    .filter(Boolean)
    .join(' · ');
  const clientContext = formatClientContext(group);
  const userContext = formatUserContext(group);

  return (
    <article className="border-border/60 border-b">
      <div className="grid gap-3 px-3 py-3 text-sm lg:grid-cols-[32px_142px_84px_80px_minmax(220px,1fr)_180px_170px_170px_88px] lg:items-start">
        <button
          aria-expanded={expanded}
          aria-label={expanded ? t('collapse') : t('expand')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-muted/40"
          onClick={onToggle}
          type="button"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <div className="font-mono text-muted-foreground text-xs">
          {formatTime(group.createdAt)}
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
            {clientContext ? (
              <span className="truncate">{clientContext}</span>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 truncate font-mono text-muted-foreground text-xs">
          {group.requestId ?? '-'}
        </div>
        <div className="min-w-0 truncate font-mono text-muted-foreground text-xs">
          {userContext || '-'}
        </div>
        <div className="min-w-0 truncate font-mono text-muted-foreground text-xs">
          {deploymentContext || '-'}
        </div>
        <div className="text-muted-foreground text-xs uppercase">
          {group.source}
        </div>
      </div>
      {expanded ? (
        <div className="space-y-3 border-border/60 border-t bg-muted/10 px-3 py-3">
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="text-muted-foreground">{t('first_event')}</p>
              <p className="font-mono">{formatTime(group.firstEventAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('route')}</p>
              <p className="truncate font-mono">{group.route ?? '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('request_id')}</p>
              <p className="truncate font-mono">{group.requestId ?? '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('user')}</p>
              <p className="truncate font-mono">{userContext || '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('deployment')}</p>
              <p className="truncate font-mono">{deploymentContext || '-'}</p>
            </div>
            {clientContext ? (
              <div className="sm:col-span-2 lg:col-span-5">
                <p className="text-muted-foreground">{t('client')}</p>
                <p className="truncate font-mono">{clientContext}</p>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            {group.events.map((event, index) => {
              const metadata = hasMetadata(event.metadata)
                ? metadataJson(event.metadata)
                : null;
              const eventClientContext = formatClientContext(event);
              const eventUserContext = formatUserContext(event);

              return (
                <div
                  className="rounded-md border border-border bg-background p-3"
                  key={event.id}
                >
                  <div className="grid gap-2 md:grid-cols-[132px_76px_76px_minmax(0,1fr)]">
                    <span className="font-mono text-muted-foreground text-xs">
                      {formatTime(event.createdAt)}
                    </span>
                    <span
                      className={cn(
                        'font-mono text-xs uppercase',
                        levelClass(event.level)
                      )}
                    >
                      {event.level}
                    </span>
                    <span
                      className={cn(
                        'font-mono text-xs',
                        statusClass(event.status)
                      )}
                    >
                      {event.status ?? '-'}
                    </span>
                    <div className="min-w-0">
                      <p className="break-words font-mono text-xs">
                        {event.message}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-muted-foreground text-xs">
                        <span>{t('event_index', { index: index + 1 })}</span>
                        {event.route ? (
                          <span className="font-mono">{event.route}</span>
                        ) : null}
                        {eventUserContext ? (
                          <span className="font-mono">{eventUserContext}</span>
                        ) : null}
                        {eventClientContext ? (
                          <span>{eventClientContext}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {event.errorStack ? (
                    <div className="mt-3">
                      <LogDetailPre label={t('error_stack')}>
                        {event.errorStack}
                      </LogDetailPre>
                    </div>
                  ) : null}
                  {metadata ? (
                    <div className="mt-3">
                      <LogDetailPre label={t('metadata')}>
                        {metadata}
                      </LogDetailPre>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}
