'use client';

import { TUTURUUU_LOCAL_LOGO_URL } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import type { LaunchableAppSlug } from '@tuturuuu/utils/launchable-apps';
import { fetchSatelliteWorkspaces } from '../../utils/workspace-actions';
import { resolveSatelliteSettingsWorkspacePath } from './settings-workspace-navigation';

export function SettingsWorkspaceBreadcrumb({
  activeTab,
  appId,
  wsId,
}: {
  activeTab: string;
  appId: LaunchableAppSlug;
  wsId: string;
}) {
  return (
    <WorkspaceSelect
      disableCreateNewWorkspace
      fallbackLogoUrl={TUTURUUU_LOCAL_LOGO_URL}
      fetchWorkspaces={fetchSatelliteWorkspaces}
      popoverModal
      resolveNextPathname={({ nextSlug }) =>
        resolveSatelliteSettingsWorkspacePath({ activeTab, appId, nextSlug })
      }
      showTierBadges={false}
      standalone
      triggerClassName="h-8 w-52 max-w-[min(13rem,35vw)] border-border/70 bg-muted/30 px-2 shadow-none hover:bg-muted/60"
      wsId={wsId}
    />
  );
}
