import type { LaunchableAppSlug } from '@tuturuuu/utils/launchable-apps';
import {
  getLaunchableApp,
  resolveLaunchableAppPath,
} from '@tuturuuu/utils/launchable-apps';

export function resolveSatelliteSettingsWorkspacePath({
  activeTab,
  appId,
  nextSlug,
}: {
  activeTab: string;
  appId: LaunchableAppSlug;
  nextSlug: string;
}) {
  const app = getLaunchableApp(appId);
  const workspace = {
    id: nextSlug,
    personal: nextSlug === 'personal',
  };
  const hasWorkspaceResolver = app !== null && 'workspacePathResolver' in app;
  const appPath = hasWorkspaceResolver
    ? resolveLaunchableAppPath({ app, workspace })
    : `/${nextSlug}`;
  const searchParams = new URLSearchParams({
    settingsDialog: 'open',
    settingsTab: activeTab,
  });

  return `${appPath}?${searchParams.toString()}`;
}
