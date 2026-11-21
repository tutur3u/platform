import { Cloud, GitBranch, TriangleAlert } from '@tuturuuu/icons';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type {
  ShipSnapshot,
  ShipSource,
} from '../../../web/src/lib/mastermind/ship/contract';
import { formatAge, formatTime, useI18n } from '../i18n';
import { shipStats, shortSha } from './model';

/** Localized source name; GitHub sources are per repository owner. */
export function useSourceName() {
  const { t } = useI18n();
  return (source: ShipSource) =>
    source.id === 'cloudflare'
      ? t('ship.source.cloudflare')
      : t('ship.source.github', {
          repository: source.id.slice('github:'.length),
        });
}

export function SourceStrip({
  snapshot,
  now,
}: {
  snapshot: ShipSnapshot;
  now: number;
}) {
  const { t, locale } = useI18n();
  const name = useSourceName();
  return (
    <ul
      className="flex flex-wrap gap-2"
      aria-label={t('ship.columns.freshness')}
    >
      {snapshot.sources.map((source) => {
        const bad = source.state === 'error' || source.state === 'backoff';
        const Icon = bad
          ? TriangleAlert
          : source.id === 'cloudflare'
            ? Cloud
            : GitBranch;
        const when =
          source.state === 'ok' && source.okAt
            ? t('ship.source.ok', {
                age: formatAge(t, now - Date.parse(source.okAt)),
              })
            : source.state === 'backoff' && source.retryAt
              ? t('ship.source.backoff', {
                  time: formatTime(locale, source.retryAt),
                })
              : source.state === 'error' && source.checkedAt
                ? t('ship.source.error', {
                    age: formatAge(t, now - Date.parse(source.checkedAt)),
                  })
                : t('ship.source.unconfigured');
        return (
          <li
            key={source.id}
            className={cn(
              'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2 text-muted-foreground text-xs',
              bad && 'border-dynamic-orange/30 text-dynamic-orange'
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <b className="font-semibold text-foreground">{name(source)}</b>
            {when}
          </li>
        );
      })}
    </ul>
  );
}

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'red' | 'orange';
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="font-medium text-muted-foreground text-sm">{label}</div>
        <div
          className={cn(
            'font-bold text-2xl tabular-nums',
            tone === 'red' && 'text-dynamic-red',
            tone === 'orange' && 'text-dynamic-orange'
          )}
        >
          {value}
        </div>
        <div className="truncate text-muted-foreground text-xs">
          {detail ?? ' '}
        </div>
      </CardContent>
    </Card>
  );
}

export function ShipStats({
  snapshot,
  now,
}: {
  snapshot: ShipSnapshot;
  now: number;
}) {
  const { t } = useI18n();
  const stats = shipStats(snapshot, now);
  const first = stats.failing[0];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat
        label={t('ship.stats.live')}
        value={`${stats.live} / ${stats.total}`}
      />
      <Stat
        label={t('ship.stats.waiting')}
        value={t('ship.stats.waitingValue', {
          n: `${stats.waiting}${stats.capped ? '+' : ''}`,
        })}
        detail={
          stats.oldest
            ? t('ship.stats.oldestIn', {
                age: formatAge(t, now - Date.parse(stats.oldest.at)),
                app: stats.oldest.app.name,
              })
            : undefined
        }
      />
      <Stat
        label={t('ship.stats.failing')}
        value={String(stats.failing.length)}
        detail={
          first?.production.release
            ? `${first.name} ${shortSha(first.production.release.sha)}`
            : undefined
        }
        tone={stats.failing.length ? 'red' : undefined}
      />
      <Stat
        label={t('ship.stats.doubtful')}
        value={String(stats.doubtful.length)}
        detail={stats.doubtful.map((app) => app.name).join(', ') || undefined}
        tone={stats.doubtful.length ? 'orange' : undefined}
      />
    </div>
  );
}
