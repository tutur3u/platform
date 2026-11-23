'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SHARED_SETTINGS_TAB_IDS } from '@tuturuuu/ui/hooks/settings-dialog-url';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { SatelliteProfileSettingsPanel } from '../profile-settings/profile-settings-panel';
import { AccountIntegrationsPanel } from './account-integrations-panel';
import { AccountSettingsLinkOut } from './account-settings-link-out';
import { isWebManagedAccountTab } from './account-settings-navigation';

/** Renders the shared account tab content; null for any other tab. */
export function SatelliteAccountSettingsPanel({
  activeTab,
  centralUrl,
  user,
}: {
  activeTab: string;
  centralUrl: string;
  user: WorkspaceUser | null;
}) {
  if (!user) return null;

  if (activeTab === 'profile') {
    return (
      <SatelliteProfileSettingsPanel centralUrl={centralUrl} user={user} />
    );
  }

  if (activeTab === SHARED_SETTINGS_TAB_IDS.accountIntegrations) {
    return (
      <AccountIntegrationsPanel
        centralUrl={centralUrl}
        isStaff={isExactTuturuuuDotComEmail(user.email)}
      />
    );
  }

  if (isWebManagedAccountTab(activeTab)) {
    return (
      <AccountSettingsLinkOut
        centralUrl={centralUrl}
        signedInEmail={user.email}
        tab={activeTab}
      />
    );
  }

  return null;
}
