'use client';

import type { WorkspaceDomainsOverview } from '@tuturuuu/internal-api/workspace-domains';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

type Summary =
  | { kind: 'staff'; used: number; total: number }
  | { kind: 'paid'; used: number; total: number }
  | { kind: 'upgrade' }
  | { kind: 'comingSoon' }
  | { kind: 'buyAddon' }
  | { kind: 'paused' }
  | { kind: 'unavailable' };

export function summarize(overview: WorkspaceDomainsOverview): Summary {
  const { entitlement, billing } = overview;
  if (entitlement.source === 'staff_bypass') {
    return { kind: 'staff', used: entitlement.used, total: entitlement.total };
  }
  if (entitlement.source === 'paid_addon') {
    return { kind: 'paid', used: entitlement.used, total: entitlement.total };
  }
  switch (entitlement.reason) {
    case 'paid_plan_required':
      return { kind: 'upgrade' };
    case 'billing_unavailable':
      return { kind: 'comingSoon' };
    case 'addon_required':
      return billing.checkoutEnabled
        ? { kind: 'buyAddon' }
        : { kind: 'comingSoon' };
    case 'kill_switch':
      return { kind: 'paused' };
    default:
      return { kind: 'unavailable' };
  }
}

export function EntitlementSummary({
  wsId,
  overview,
}: {
  wsId: string;
  overview: WorkspaceDomainsOverview;
}) {
  const t = useTranslations('workspace-domains');
  const summary = summarize(overview);
  const price = { price: overview.billing.pricePerDomainMonthlyUsd };
  const billingLink = (label: string) => (
    <Button variant="outline" asChild>
      <Link href={`/${wsId}/billing`}>{label}</Link>
    </Button>
  );

  const row = (() => {
    switch (summary.kind) {
      case 'staff':
        return (
          <SettingItemTab
            title={t('entitlement.staffTitle')}
            description={t('entitlement.staff', {
              used: summary.used,
              total: summary.total,
            })}
          />
        );
      case 'paid':
        return (
          <SettingItemTab
            title={t('entitlement.paidTitle')}
            description={t('entitlement.paid', {
              used: summary.used,
              total: summary.total,
            })}
          />
        );
      case 'upgrade':
        return (
          <SettingItemTab
            title={t('entitlement.upgradeTitle')}
            description={t('entitlement.upgrade', price)}
          >
            {billingLink(t('entitlement.upgradeAction'))}
          </SettingItemTab>
        );
      case 'comingSoon':
        return (
          <SettingItemTab
            title={t('entitlement.comingSoonTitle')}
            description={t('entitlement.comingSoon', price)}
          />
        );
      case 'buyAddon':
        return (
          <SettingItemTab
            title={t('entitlement.addonTitle')}
            description={t('entitlement.addon', price)}
          >
            {billingLink(t('entitlement.addonAction'))}
          </SettingItemTab>
        );
      case 'paused':
        return (
          <SettingItemTab
            title={t('entitlement.pausedTitle')}
            description={t('entitlement.paused')}
          />
        );
      case 'unavailable':
        return (
          <SettingItemTab
            title={t('entitlement.unavailableTitle')}
            description={t('entitlement.unavailable')}
          />
        );
      default: {
        const unreachable: never = summary;
        return unreachable;
      }
    }
  })();

  return (
    <SettingsSection title={t('entitlement.title')}>{row}</SettingsSection>
  );
}
