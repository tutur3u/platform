import {
  Building2,
  Coins,
  Smartphone,
  TrendingUp,
  UserPlus,
  Users,
} from '@tuturuuu/icons';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  deriveExecutiveIndicators,
  type ExecutiveSnapshot,
} from '../executive-data';
import DataCoverage from './data-coverage';
import {
  ExecutivePanel,
  KpiTile,
  ShareBar,
  UnavailableBadge,
} from './executive-primitives';

interface Props {
  snapshot: ExecutiveSnapshot;
  wsId: string;
}

export default async function ExecutiveView({ snapshot, wsId }: Props) {
  const t = await getTranslations('infrastructure-analytics.executive');
  const locale = await getLocale();
  const number = new Intl.NumberFormat(locale, { notation: 'compact' });
  const exact = new Intl.NumberFormat(locale);
  const pct = (value: number) => `${value.toLocaleString(locale)}%`;
  const signedPct = (value: number) =>
    `${value > 0 ? '+' : ''}${value.toLocaleString(locale)}%`;

  const indicators = deriveExecutiveIndicators(snapshot);
  const { aiCredits, devices, engagement, growth, workspaces } = snapshot;
  const unavailable = t('unavailable');

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          detail={
            engagement.status === 'ok' &&
            t('mau-detail', {
              dau: exact.format(engagement.data.dau),
              wau: exact.format(engagement.data.wau),
            })
          }
          icon={<Users className="h-4 w-4" />}
          label={t('kpi.mau')}
          unavailableLabel={unavailable}
          value={
            engagement.status === 'ok'
              ? number.format(engagement.data.mau)
              : null
          }
        />
        <KpiTile
          detail={t('stickiness-detail')}
          icon={<TrendingUp className="h-4 w-4" />}
          label={t('kpi.stickiness')}
          unavailableLabel={unavailable}
          value={
            indicators.stickiness === null ? null : pct(indicators.stickiness)
          }
        />
        <KpiTile
          detail={
            growth.status === 'ok' &&
            (growth.data.growthRateMonthly === null
              ? t('growth-no-baseline')
              : t('growth-detail', {
                  rate: signedPct(growth.data.growthRateMonthly),
                  total: exact.format(growth.data.totalUsers),
                }))
          }
          icon={<UserPlus className="h-4 w-4" />}
          label={t('kpi.new-users-month')}
          unavailableLabel={unavailable}
          value={
            growth.status === 'ok'
              ? exact.format(growth.data.usersThisMonth)
              : null
          }
        />
        <KpiTile
          detail={
            workspaces.status === 'ok' &&
            t('workspaces-detail', {
              activation:
                indicators.workspaceActivation === null
                  ? '—'
                  : pct(indicators.workspaceActivation),
              total: exact.format(workspaces.data.totalWorkspaces),
            })
          }
          icon={<Building2 className="h-4 w-4" />}
          label={t('kpi.active-workspaces')}
          unavailableLabel={unavailable}
          value={
            workspaces.status === 'ok'
              ? exact.format(workspaces.data.activeWorkspaces)
              : null
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ExecutivePanel
          action={{ href: `/${wsId}/ai-credits`, label: t('open-ai-credits') }}
          description={t('spend.description')}
          title={t('spend.title')}
        >
          {aiCredits.status === 'ok' ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-primary/10 p-2 text-primary">
                  <Coins className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-bold text-2xl tabular-nums">
                    {number.format(aiCredits.data.creditsConsumed)}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('spend.consumed-of', {
                      allocated: number.format(aiCredits.data.creditsAllocated),
                    })}
                  </div>
                </div>
              </div>
              {indicators.creditUtilization !== null && (
                <ShareBar
                  label={t('spend.utilization')}
                  percentage={indicators.creditUtilization}
                  value={pct(indicators.creditUtilization)}
                />
              )}
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <Stat
                  label={t('spend.bonus')}
                  value={number.format(aiCredits.data.bonusCredits)}
                />
                <Stat
                  label={t('spend.workspace-wallets')}
                  value={exact.format(aiCredits.data.workspacesWithBalance)}
                />
                <Stat
                  label={t('spend.user-wallets')}
                  value={exact.format(aiCredits.data.usersWithBalance)}
                />
              </dl>
              <p className="text-muted-foreground text-xs">
                {t('spend.unit-note')}
              </p>
            </div>
          ) : (
            <UnavailableBadge label={unavailable} />
          )}
        </ExecutivePanel>

        <ExecutivePanel
          action={{
            href: `/${wsId}/mobile-versions`,
            label: t('open-mobile'),
          }}
          description={t('reach.description')}
          title={t('reach.title')}
        >
          {devices.status === 'ok' && devices.data.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-primary/10 p-2 text-primary">
                  <Smartphone className="h-4 w-4" />
                </span>
                <div>
                  <div className="font-bold text-2xl tabular-nums">
                    {indicators.mobileSessionShare === null
                      ? '—'
                      : pct(indicators.mobileSessionShare)}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {t('reach.mobile-share')}
                  </div>
                </div>
              </div>
              {devices.data.map((device) => (
                <ShareBar
                  key={device.deviceType}
                  label={device.deviceType || t('reach.unknown-device')}
                  percentage={device.percentage}
                  value={t('reach.sessions', {
                    count: exact.format(device.sessionCount),
                    percentage: pct(device.percentage),
                  })}
                />
              ))}
              <p className="text-muted-foreground text-xs">
                {t('reach.classification-note')}
              </p>
            </div>
          ) : devices.status === 'ok' ? (
            <p className="text-muted-foreground text-sm">{t('reach.empty')}</p>
          ) : (
            <UnavailableBadge label={unavailable} />
          )}
        </ExecutivePanel>
      </div>

      <DataCoverage snapshot={snapshot} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
