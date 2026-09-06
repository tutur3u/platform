'use client';
import { SatelliteAccountSwitcherMenu as SharedAccountSwitcherMenu } from '@tuturuuu/ui/custom/satellite-account-switcher-menu';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

export { webAccountSettingsUrl } from '@tuturuuu/ui/custom/satellite-account-switcher-menu';
export function SatelliteAccountSwitcherMenu({
  centralUrl,
  workspaceId,
}: {
  centralUrl: string;
  workspaceId?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations('account_switcher');
  const query = searchParams.toString();
  return (
    <SharedAccountSwitcherMenu
      centralUrl={centralUrl}
      workspaceId={workspaceId}
      currentRoute={`${pathname}${query ? `?${query}` : ''}`}
      t={t}
    />
  );
}
