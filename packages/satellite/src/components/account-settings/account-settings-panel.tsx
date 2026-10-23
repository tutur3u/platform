'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { SatelliteProfileSettingsPanel } from '../profile-settings/profile-settings-panel';
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
