import { Badge } from '@tuturuuu/ui/badge';
import { getTranslations } from 'next-intl/server';
import type { ExecutiveSnapshot } from '../executive-data';
import { ExecutivePanel } from './executive-primitives';

/**
 * Sources the executive view reads directly. Their live status comes from the
 * snapshot so a failed query is shown as failed, not as a zero.
 */
const CONNECTED_SOURCES = [
  'engagement',
  'growth',
  'workspaces',
  'devices',
  'aiCredits',
] as const satisfies readonly (keyof ExecutiveSnapshot)[];

/**
 * Decision data outside the executive snapshot. Some sources are available in
 * other Admin views.
 */
export const OUTSIDE_OVERVIEW_SOURCES = [
  'cloud-spend',
  'mobile-telemetry',
  'app-ecosystem',
  'role-scoped-views',
] as const;

export default async function DataCoverage({
  snapshot,
  wsId,
}: {
  snapshot: ExecutiveSnapshot;
  wsId: string;
}) {
  const t = await getTranslations('infrastructure-analytics.coverage');

  return (
    <ExecutivePanel
      action={{
        href: `/${wsId}/monitoring/observability`,
        label: t('open-observability'),
      }}
      description={t('description')}
      title={t('title')}
    >
      <ul className="divide-y divide-border">
        {CONNECTED_SOURCES.map((key) => {
          const ok = snapshot[key].status === 'ok';
          return (
            <li
              className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              key={key}
            >
              <div className="min-w-0">
                <div className="font-medium text-sm">
                  {t(`sources.${key}.title`)}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t(`sources.${key}.origin`)}
                </div>
              </div>
              <Badge
                className="w-fit font-normal"
                variant={ok ? 'success' : 'error'}
              >
                {ok ? t('status.live') : t('status.failed')}
              </Badge>
            </li>
          );
        })}
        {OUTSIDE_OVERVIEW_SOURCES.map((key) => (
          <li
            className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
            key={key}
          >
            <div className="min-w-0">
              <div className="font-medium text-sm">
                {t(`gaps.${key}.title`)}
              </div>
              <div className="text-muted-foreground text-xs">
                {t(`gaps.${key}.detail`)}
              </div>
            </div>
            <Badge className="w-fit font-normal" variant="outline">
              {t('status.outside-overview')}
            </Badge>
          </li>
        ))}
      </ul>
    </ExecutivePanel>
  );
}
