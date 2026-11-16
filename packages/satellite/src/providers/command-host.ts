import {
  getLaunchableAppByTitle,
  type LaunchableAppSlug,
} from '@tuturuuu/utils/launchable-apps';
import type { CommandLauncherHostApp } from '../components/command-launcher/command-launcher-utils';

/**
 * Hosts whose provider `appName` does not match a launchable app title or
 * alias. They receive the command center without becoming a tracked app:
 * app-switch tracking and the mobile dock still follow `currentApp` only.
 * `external` marks a host outside the launchable catalog.
 */
const COMMAND_HOST_BY_APP_NAME: Readonly<
  Record<string, CommandLauncherHostApp>
> = {
  'tuturuuu infra': 'external',
  'tuturuuu qr': 'tools',
};

export function resolveLaunchableHostApp(
  appName: string
): LaunchableAppSlug | undefined {
  return (
    getLaunchableAppByTitle(appName)?.slug ??
    getLaunchableAppByTitle(appName.replace(/^Tuturuuu\s+/i, ''))?.slug
  );
}

export function resolveCommandHost(
  appName: string,
  currentApp: LaunchableAppSlug | undefined
): CommandLauncherHostApp | undefined {
  return currentApp ?? COMMAND_HOST_BY_APP_NAME[appName.trim().toLowerCase()];
}
