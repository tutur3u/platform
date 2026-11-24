'use client';

import { useQuery } from '@tanstack/react-query';
import { Crown, GitCompare, Sparkles } from '@tuturuuu/icons';
import {
  getWorkspaceUpgradeOptions,
  type UpgradePlanCycle,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Dialog } from '@tuturuuu/ui/dialog';
import { LoadingRegion, Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { useUpgradeDialogUrlState } from '../../../hooks/use-upgrade-dialog-url-state';
import {
  SatelliteSettingsDialogShell,
  type SettingsDialogShellProps,
  type SettingsNavGroup,
} from './satellite-settings-dialog-shell';
import { SettingsSectionMessage } from './settings-section';
import { ComparePanel } from './upgrade-dialog-compare';
import { CurrentPlanPanel } from './upgrade-dialog-current';
import { isForbidden } from './upgrade-dialog-format';
import { BillingLink, PlansPanel } from './upgrade-dialog-plans';

type ShellT = SettingsDialogShellProps['t'];

export const upgradeOptionsQueryKey = (wsId: string) =>
  ['workspace-upgrade-options', wsId] as const;

/**
 * The Upgrade dialog, laid out like Settings: plans, a plan comparison and the
 * workspace's current plan. Checkout is handed off to the billing page.
 * Its open state lives in `?upgradeDialog=open&upgradeTab=<tab>`.
 */
export function UpgradeDialog({
  billingFallbackHref,
  wsId,
}: {
  /** Billing link used before the plan data (and its pay URL) has loaded. */
  billingFallbackHref: string;
  wsId: string;
}) {
  const { closeUpgrade, open, selectTab, tab } = useUpgradeDialogUrlState();
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) closeUpgrade();
      }}
      open={open}
    >
      {open && (
        <UpgradeDialogBody
          billingFallbackHref={billingFallbackHref}
          onTabChange={selectTab}
          tab={tab}
          wsId={wsId}
        />
      )}
    </Dialog>
  );
}

function UpgradeDialogBody({
  billingFallbackHref,
  onTabChange,
  tab,
  wsId,
}: {
  billingFallbackHref: string;
  onTabChange: (tab: string) => void;
  tab: string;
  wsId: string;
}) {
  const t = useTranslations('upgrade_dialog');
  const root = useTranslations();
  const [cycle, setCycle] = useState<UpgradePlanCycle>('year');
  const query = useQuery({
    queryFn: () => getWorkspaceUpgradeOptions(wsId),
    queryKey: upgradeOptionsQueryKey(wsId),
    staleTime: 30_000,
  });
  const shellT = useCallback<ShellT>(
    (key, values) => {
      switch (key) {
        case 'common.settings':
          return t('title');
        case 'settings.search_settings_placeholder':
          return t('search');
        case 'common.close':
          return root('common.close');
        case 'common.no_results_found':
          return root('common.no_results_found');
        case 'settings.back_to_app':
          return root('settings.back_to_app');
        case 'settings.manage_settings':
          return root('settings.manage_settings', values);
        case 'search.search':
          return root('search.search');
        default:
          return key;
      }
    },
    [root, t]
  );
  const navItems = useMemo<SettingsNavGroup[]>(
    () => [
      {
        label: t('title'),
        items: [
          {
            description: t('plans_description'),
            icon: Sparkles,
            label: t('tab_plans'),
            name: 'plans',
          },
          {
            description: t('compare_description'),
            icon: GitCompare,
            label: t('tab_compare'),
            name: 'compare',
          },
          {
            description: t('current_description'),
            icon: Crown,
            label: t('tab_current'),
            name: 'current',
          },
        ],
      },
    ],
    [t]
  );
  const data = query.data;

  return (
    <SatelliteSettingsDialogShell
      activeTab={tab}
      navItems={navItems}
      onActiveTabChange={onTabChange}
      onboardingPanel={null}
      persistedTab={tab}
      setPersistedTab={onTabChange}
      showOnboardingGuide={false}
      t={shellT}
    >
      {query.isLoading ? (
        <LoadingRegion className="space-y-4" srLabel={t('loading')}>
          <Skeleton className="h-9 w-40" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </LoadingRegion>
      ) : !data ? (
        <div className="rounded-xl border bg-card">
          <SettingsSectionMessage
            action={
              isForbidden(query.error) ? undefined : (
                <Button
                  onClick={() => query.refetch()}
                  size="sm"
                  variant="outline"
                >
                  {t('retry')}
                </Button>
              )
            }
            tone="error"
          >
            {isForbidden(query.error) ? t('forbidden') : t('load_error')}
          </SettingsSectionMessage>
        </div>
      ) : (
        <div className="space-y-6">
          {tab === 'compare' ? (
            <ComparePanel cycle={cycle} data={data} onCycleChange={setCycle} />
          ) : tab === 'current' ? (
            <CurrentPlanPanel data={data} />
          ) : (
            <PlansPanel cycle={cycle} data={data} onCycleChange={setCycle} />
          )}
          <BillingLink href={data.billingUrl || billingFallbackHref} />
        </div>
      )}
    </SatelliteSettingsDialogShell>
  );
}
