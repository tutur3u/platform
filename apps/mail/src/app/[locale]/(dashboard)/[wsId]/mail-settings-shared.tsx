'use client';

import { useQuery } from '@tanstack/react-query';
import { Paintbrush } from '@tuturuuu/icons';
import { getCurrentUserProfile } from '@tuturuuu/internal-api';
import {
  createAccountSettingsNavGroup,
  SatelliteAccountSettingsPanel,
  satelliteProfileQueryKey,
} from '@tuturuuu/satellite/account-settings';
import {
  createWorkspaceSettingsNavGroup,
  SatelliteWorkspaceSettingsPanel,
} from '@tuturuuu/satellite/workspace-settings';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { AppearanceSettings } from '@tuturuuu/ui/custom/settings/appearance-settings';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/satellite-settings-dialog-shell';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { TTR_URL } from '@/constants/common';

/**
 * The account, workspace and appearance groups every satellite settings
 * dialog shows, built from the shared satellite factories.
 */
export function useMailSharedSettingsNav(): SettingsNavGroup[] {
  const t = useTranslations();
  return useMemo(
    () => [
      createAccountSettingsNavGroup(t),
      createWorkspaceSettingsNavGroup(t),
      {
        label: t('satellite-account-settings.preferences'),
        items: [
          {
            description: t('satellite-account-settings.appearance_description'),
            icon: Paintbrush,
            keywords: ['Appearance', 'Theme', 'Language'],
            label: t('satellite-account-settings.appearance'),
            name: 'appearance',
          },
        ],
      },
    ],
    [t]
  );
}

export function isMailSharedSettingsTab(
  groups: SettingsNavGroup[],
  tab: string
) {
  return groups.some((group) => group.items.some((item) => item.name === tab));
}

/** Renders the shared tab content; null for Mail's own tabs. */
export function MailSharedSettingsPanels({
  activeTab,
  workspaceId,
}: {
  activeTab: string;
  workspaceId: string;
}) {
  const profileQuery = useQuery({
    queryFn: () => getCurrentUserProfile(),
    queryKey: [...satelliteProfileQueryKey],
  });
  const user = (profileQuery.data ?? null) as WorkspaceUser | null;

  return (
    <>
      <SatelliteAccountSettingsPanel
        activeTab={activeTab}
        centralUrl={TTR_URL}
        user={user}
      />
      <SatelliteWorkspaceSettingsPanel
        activeTab={activeTab}
        user={user}
        wsId={workspaceId}
      />
      {activeTab === 'appearance' && (
        <AppearanceSettings
          canManageVersionBadge={isExactTuturuuuDotComEmail(user?.email)}
        />
      )}
    </>
  );
}
