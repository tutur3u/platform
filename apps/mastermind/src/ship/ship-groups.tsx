import { CircleCheck, Folder, GitCommitHorizontal } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import type { ShipSnapshot } from '../../../web/src/lib/mastermind/ship/contract';
import { toneBadge } from '../components/tone';
import { useI18n } from '../i18n';
import { groupsOf, rowFreshness, sourceMap } from './model';
import { SHIP_GRID, ShipRow } from './ship-row';

/** One card per product, one row per app. */
export function ShipGroups({
  snapshot,
  now,
}: {
  snapshot: ShipSnapshot;
  now: number;
}) {
  const { t } = useI18n();
  const sources = sourceMap(snapshot);
  return groupsOf(snapshot).map((group) => (
    <Card key={group.id} className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Folder className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-semibold">{t(`ship.groups.${group.id}`)}</h2>
          <span className="text-muted-foreground text-xs">
            {t('ship.liveOf', { live: group.live, total: group.apps.length })}
          </span>
        </div>
        {group.waiting ? (
          <Badge variant="outline" className={toneBadge('orange', 'gap-1')}>
            <GitCommitHorizontal className="size-3" aria-hidden />
            {t('ship.waitingBadge', { n: group.waiting })}
          </Badge>
        ) : (
          <Badge variant="outline" className={toneBadge('green', 'gap-1')}>
            <CircleCheck className="size-3" aria-hidden />
            {t('ship.nothingWaiting')}
          </Badge>
        )}
      </div>
      <div
        className={`${SHIP_GRID} hidden border-t bg-muted/40 py-2 font-medium text-muted-foreground text-xs lg:grid`}
        aria-hidden
      >
        <span>{t('ship.columns.app')}</span>
        <span>{t('ship.columns.production')}</span>
        <span>{t('ship.columns.staging')}</span>
        <span>{t('ship.columns.waiting')}</span>
        <span>{t('ship.columns.freshness')}</span>
      </div>
      {group.apps.map((app) => (
        <ShipRow
          key={app.id}
          app={app}
          fresh={rowFreshness(app, sources, now)}
          sources={sources}
          now={now}
        />
      ))}
    </Card>
  ));
}
