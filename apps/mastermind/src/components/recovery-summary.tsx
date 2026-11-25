import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { type FleetState, RECOVERY_STALE_AFTER_MS } from '../fleet/contract';
import { formatTime, type MessageKey, useI18n } from '../i18n';

function CountGroup({
  title,
  counts,
}: {
  title: string;
  counts: Partial<Record<string, number>>;
}) {
  const { t } = useI18n();
  const entries = Object.entries(counts);
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      {entries.length ? (
        <dl className="text-sm">
          {entries.map(([key, count]) => (
            <div className="flex justify-between gap-2" key={key}>
              <dt>{t(`recovery.labels.${key}` as MessageKey)}</dt>
              <dd className="tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted-foreground text-sm">{t('recovery.none')}</p>
      )}
    </div>
  );
}

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
        ['provider', recovery.byProviderFamily],
        ['executed', recovery.actionsExecuted],
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
                now - Date.parse(recovery.generatedAt) >
                  RECOVERY_STALE_AFTER_MS) && (
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
                <CountGroup
                  key={group}
                  title={t(`recovery.${group}`)}
                  counts={counts}
                />
              ))}
              <div>
                <h3 className="font-medium">{t('recovery.holds')}</h3>
                {recovery.holdsPreserved.length ? (
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {recovery.holdsPreserved.map((hold) => (
                      <li key={hold}>
                        <Badge variant="outline">
                          {t(`recovery.labels.${hold}` as MessageKey)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t('recovery.none')}
                  </p>
                )}
              </div>
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
