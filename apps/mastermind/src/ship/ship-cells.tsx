import {
  CircleCheck,
  CircleX,
  Clock,
  RefreshCw,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import type { ReactNode } from 'react';
import type {
  ShipApp,
  ShipRelease,
  ShipWorker,
} from '../../../web/src/lib/mastermind/ship/contract';
import { type Tone, toneBadge } from '../components/tone';
import { formatAge, useI18n } from '../i18n';
import { formatShipTime } from './format';
import { shortSha } from './model';

const DEPLOY = {
  ok: ['green', CircleCheck],
  failed: ['red', CircleX],
  running: ['blue', RefreshCw],
} as const;
const CI = {
  success: ['green', CircleCheck],
  failure: ['red', CircleX],
  pending: ['blue', RefreshCw],
  none: ['gray', Clock],
} as const;

export function StateBadge({
  tone,
  icon: Icon,
  children,
}: {
  tone: Tone;
  icon?: typeof Clock;
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={toneBadge(tone, 'gap-1')}>
      {Icon ? <Icon className="size-3" aria-hidden /> : null}
      {children}
    </Badge>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="font-medium text-muted-foreground text-xs lg:hidden">
      {children}
    </div>
  );
}

export function EnvCell({
  label,
  release,
  worker,
  empty,
}: {
  label: string;
  release: ShipRelease | null;
  worker: ShipWorker | null;
  empty: { badge: string; note: string; icon?: typeof Clock };
}) {
  const { t, locale } = useI18n();
  if (!release)
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <StateBadge tone="gray" icon={empty.icon}>
          {empty.badge}
        </StateBadge>
        <div className="text-muted-foreground text-xs">{empty.note}</div>
      </div>
    );
  const [deployTone, DeployIcon] = DEPLOY[release.deploy];
  const [ciTone, CiIcon] = CI[release.ci];
  const drift = worker?.sha && worker.sha !== release.sha ? worker.sha : null;
  return (
    <div className="min-w-0 space-y-1">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate font-medium">
          {worker ? worker.versionId.slice(0, 8) : release.environment}
        </span>
        <span className="rounded-sm bg-muted px-1 font-mono text-xs">
          {shortSha(release.sha)}
        </span>
        {worker && worker.percentage < 100 ? (
          <span className="text-muted-foreground text-xs">
            {t('ship.env.split', { percent: worker.percentage })}
          </span>
        ) : null}
      </div>
      <div className="text-muted-foreground text-xs tabular-nums">
        {t('ship.env.ict', {
          time: formatShipTime(locale, release.deployedAt),
        })}
      </div>
      <div className="flex flex-wrap gap-1">
        <StateBadge tone={deployTone} icon={DeployIcon}>
          {t(`ship.deploy.${release.deploy}`)}
        </StateBadge>
        <StateBadge tone={ciTone} icon={CiIcon}>
          {t(`ship.ci.${release.ci}`)}
        </StateBadge>
        {drift ? (
          <StateBadge tone="orange" icon={TriangleAlert}>
            {t('ship.env.workerRuns', { sha: shortSha(drift) })}
          </StateBadge>
        ) : null}
      </div>
    </div>
  );
}

export function PendingCell({ app, now }: { app: ShipApp; now: number }) {
  const { t } = useI18n();
  const pending = app.pending;
  return (
    <div className="space-y-1">
      <Label>{t('ship.columns.waiting')}</Label>
      {!pending ? (
        <span className="text-muted-foreground text-xs">
          {t('ship.pending.unknown')}
        </span>
      ) : pending.commits === 0 ? (
        <StateBadge tone="green" icon={CircleCheck}>
          {t('ship.pending.upToDate')}
        </StateBadge>
      ) : (
        <>
          <div className="font-semibold tabular-nums">
            {t(
              pending.capped
                ? 'ship.pending.commitsCapped'
                : 'ship.pending.commits',
              {
                n: pending.commits,
              }
            )}
          </div>
          {pending.oldestAt ? (
            <div className="text-muted-foreground text-xs">
              {t('ship.pending.oldest', {
                age: formatAge(t, now - Date.parse(pending.oldestAt)),
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
