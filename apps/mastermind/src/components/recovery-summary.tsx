import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { FleetState } from '../fleet/contract';
import { formatTime, useI18n } from '../i18n';

export function RecoverySummary({
  state,
  now,
}: {
  state: FleetState;
  now: number;
}) {
  const { t, locale } = useI18n();
  const recovery = state.recovery;
  const groups = recovery
    ? ([
        ['status', recovery.byStatus],
        ['reason', recovery.byReason],
        ['owner', recovery.byOwnerClass],
        ['eligibility', recovery.byRetryEligibility],
        ['action', recovery.byNextAction],
      ] as const)
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('recovery.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {recovery ? (
          <>
            <p>{t('recovery.total', { count: recovery.total })}</p>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
              <time dateTime={recovery.generatedAt}>
                {formatTime(locale, recovery.generatedAt)}
              </time>
              {(recovery.stale ||
                now - Date.parse(recovery.generatedAt) > 7_200_000) && (
                <Badge variant="outline">{t('recovery.stale')}</Badge>
              )}
              {recovery.coverage.partial && (
                <span>
                  {t('recovery.partial', {
                    read: recovery.coverage.hostsRead,
                    expected: recovery.coverage.hostsExpected,
                  })}
                </span>
              )}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {groups.map(([group, counts]) => (
                <div key={group}>
                  <h3 className="font-medium">{t(`recovery.${group}`)}</h3>
                  <dl className="text-sm">
                    {Object.entries(counts).map(([key, count]) => (
                      <div className="flex justify-between gap-2" key={key}>
                        <dt>
                          {t(
                            `recovery.labels.${key}` as Parameters<typeof t>[0]
                          )}
                        </dt>
                        <dd className="tabular-nums">{count}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('recovery.unavailable')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
