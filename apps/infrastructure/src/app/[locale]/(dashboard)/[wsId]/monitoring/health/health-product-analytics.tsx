import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { AnalyticsCell } from '@/lib/observability-health/load';

const COLUMNS = [
  { app: 'platform', metric: 'dau' },
  { app: 'platform', metric: 'wau' },
  { app: 'platform', metric: 'signups' },
  { app: 'meet', metric: 'meet_minutes' },
  { app: 'meet', metric: 'meet_participants' },
  { app: 'platform', metric: 'ai_requests' },
  { app: 'platform', metric: 'ai_users' },
] as const;

/** The analytics app for a Worker: Meet Workers show Meet, others the platform. */
export function analyticsApp(service: string) {
  return /^tuturuuu-meet(?:-|$)/.test(service) ? 'meet' : 'platform';
}

export async function HealthProductAnalytics({
  app,
  cells,
}: {
  /** Limits the columns to one app for a drill-down; null shows all. */
  app: 'meet' | 'platform' | null;
  cells: AnalyticsCell[] | null;
}) {
  const columns = app
    ? COLUMNS.filter((column) => column.app === app)
    : COLUMNS;
  const t = await getTranslations('observability-health.analytics');
  const format = await getFormatter();

  const days = cells
    ? [...new Set(cells.map((cell) => cell.day))].sort().reverse()
    : [];
  const lookup = new Map(
    (cells ?? []).map((cell) => [
      `${cell.day}|${cell.app}|${cell.metric}`,
      cell,
    ])
  );

  return (
    <section aria-labelledby="health-analytics-title" className="space-y-3">
      <div className="space-y-1">
        <h2
          className="font-semibold text-base tracking-tight"
          id="health-analytics-title"
        >
          {t('title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('privacy')}</p>
      </div>
      {cells === null ? (
        <p
          className="rounded-lg border bg-card px-4 py-4 text-sm md:px-5"
          role="alert"
        >
          {t('load_error')}
        </p>
      ) : days.length === 0 ? (
        <p className="rounded-lg border bg-card px-4 py-4 text-muted-foreground text-sm md:px-5">
          {t('empty')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('day')}</TableHead>
                {columns.map((column) => (
                  <TableHead className="text-end" key={column.metric}>
                    {t(`metrics.${column.metric}`)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {days.map((day) => (
                <TableRow key={day}>
                  <TableCell className="whitespace-nowrap">
                    {format.dateTime(new Date(`${day}T00:00:00Z`), {
                      dateStyle: 'medium',
                      timeZone: 'UTC',
                    })}
                  </TableCell>
                  {columns.map((column) => {
                    const cell = lookup.get(
                      `${day}|${column.app}|${column.metric}`
                    );
                    return (
                      <TableCell
                        className="text-end tabular-nums"
                        key={column.metric}
                      >
                        {!cell
                          ? t('missing')
                          : cell.suppressed || cell.value === null
                            ? t('suppressed')
                            : format.number(cell.value, {
                                maximumFractionDigits: 0,
                              })}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
