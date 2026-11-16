import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SHARED_SETTINGS_TAB_IDS } from '@tuturuuu/ui/hooks/settings-dialog-url';
import { buildCoreSettingsNavGroups } from './settings-dialog-nav-core';
import { buildDeveloperSettingsNavGroups } from './settings-dialog-nav-developer';
import type { SettingsNavBuilderParams } from './settings-dialog-nav-types';
import { buildWorkspaceSettingsNavGroups } from './settings-dialog-nav-workspace';

export function buildSettingsNavItems(
  params: SettingsNavBuilderParams
): SettingsNavGroup[] {
  return [
    ...buildCoreSettingsNavGroups(params),
    ...buildWorkspaceSettingsNavGroups(params),
    ...buildDeveloperSettingsNavGroups(params),
  ];
}

/**
 * Whether `tab` can stay active. The shell injects the guidance tab itself,
 * so it never appears in the app's own nav groups.
 */
export function isSettingsTabVisible(
  navItems: SettingsNavGroup[],
  tab: string
): boolean {
  return (
    tab === SHARED_SETTINGS_TAB_IDS.onboardingGuide ||
    navItems.some((group) =>
      group.items.some((item) => item.name === tab && !item.disabled)
    )
  );
}
