'use client';
import { SatelliteAccountSwitcherMenu as SharedAccountSwitcherMenu } from '@tuturuuu/ui/custom/satellite-account-switcher-menu';
import { useTranslations } from 'next-intl';

export { webAccountSettingsUrl } from '@tuturuuu/ui/custom/satellite-account-switcher-menu';
export function SatelliteAccountSwitcherMenu({
  centralUrl,
  workspaceId,
}: {
  centralUrl: string;
  workspaceId?: string;
}) {
  const t = useTranslations('account_switcher');
  return (
    <SharedAccountSwitcherMenu
      centralUrl={centralUrl}
      workspaceId={workspaceId}
      t={t}
    />
  );
}
