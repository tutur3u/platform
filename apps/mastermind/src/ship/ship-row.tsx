import { TriangleAlert } from '@tuturuuu/icons';
import type {
  ShipApp,
  ShipSource,
} from '../../../web/src/lib/mastermind/ship/contract';
import { toneDot } from '../components/tone';
import { formatAge, useI18n } from '../i18n';
import type { Freshness } from './model';
import { EnvCell, PendingCell } from './ship-cells';

/** Columns of the desktop table; rows stack below `lg`. */
export const SHIP_GRID =
  'grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,1fr)_7.5rem_9rem]';

function FreshCell({
  app,
  fresh,
  sources,
  now,
}: {
  app: ShipApp;
  fresh: Freshness;
  sources: Map<string, ShipSource>;
  now: number;
}) {
  const { t } = useI18n();
  const age = fresh.okAt ? formatAge(t, now - Date.parse(fresh.okAt)) : '';
  const failed = new Set(fresh.failed.map((source) => source.id));
  const text =
    app.sources.length === 0
      ? t('ship.fresh.notConfigured')
      : fresh.kind === 'partial'
        ? t(
            fresh.failed.length === app.sources.length
              ? 'ship.fresh.partialOnly'
              : 'ship.fresh.partial',
            {
              sources: fresh.failed
                .map((s) =>
                  t(
                    `ship.chips.${s.id === 'cloudflare' ? 'cloudflare' : 'github'}`
                  )
                )
                .join(', '),
              age,
            }
          )
        : t(`ship.fresh.${fresh.kind}`, { age });
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className={toneDot(fresh.tone)} aria-hidden />
        <span className="font-medium text-xs">{text}</span>
      </div>
      {app.sources.length > 0 ? (
        <div className="text-muted-foreground text-xs">
          {t('ship.fresh.from')}{' '}
          {app.sources.map((id, index) => (
            <span
              key={id}
              className={failed.has(id) ? 'text-dynamic-orange' : undefined}
            >
              {index > 0 ? ' · ' : ''}
              {t(`ship.chips.${id === 'cloudflare' ? 'cloudflare' : 'github'}`)}
              {failed.has(id) || sources.get(id)?.state === 'unconfigured'
                ? ` (${t(failed.has(id) ? 'ship.source.down' : 'ship.source.unconfigured')})`
                : ''}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ShipRow({
  app,
  fresh,
  sources,
  now,
}: {
  app: ShipApp;
  fresh: Freshness;
  sources: Map<string, ShipSource>;
  now: number;
}) {
  const { t } = useI18n();
  const stale = fresh.kind !== 'checked';
  const unknown = {
    badge: t('ship.env.unknown'),
    note: t('ship.env.noRecord'),
    icon: TriangleAlert,
  };
  // No production record while staging has one: a first release.
  const production =
    !app.production.release && app.staging?.release
      ? { badge: t('ship.env.notLive'), note: t('ship.env.stagingOnly') }
      : unknown;
  return (
    <div
      className={`${SHIP_GRID} border-t ${stale ? 'bg-dynamic-orange/5' : 'hover:bg-muted/50'}`}
    >
      <div className="min-w-0 sm:col-span-2 lg:col-span-1">
        <div className="font-semibold">{app.name}</div>
        <div className="truncate font-mono text-muted-foreground text-xs">
          {app.repository ?? t('ship.fresh.notConfigured')}
        </div>
      </div>
      <EnvCell
        label={t('ship.columns.production')}
        release={app.production.release}
        worker={app.production.worker}
        empty={production}
      />
      <EnvCell
        label={t('ship.columns.staging')}
        release={app.staging?.release ?? null}
        worker={app.staging?.worker ?? null}
        empty={
          app.staging
            ? unknown
            : { badge: t('ship.env.none'), note: t('ship.env.noStaging') }
        }
      />
      <PendingCell app={app} now={now} />
      <FreshCell app={app} fresh={fresh} sources={sources} now={now} />
    </div>
  );
}
