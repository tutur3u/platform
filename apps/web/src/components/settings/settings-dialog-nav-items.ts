import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { buildCoreSettingsNavGroups } from './settings-dialog-nav-core';
import { buildDomainSettingsNavGroups } from './settings-dialog-nav-domain';
import { buildInfrastructureSettingsNavGroups } from './settings-dialog-nav-infrastructure';
import type { SettingsNavBuilderParams } from './settings-dialog-nav-types';
import { buildWorkspaceSettingsNavGroups } from './settings-dialog-nav-workspace';

export function buildSettingsNavItems(
  params: SettingsNavBuilderParams
): SettingsNavGroup[] {
  return [
    ...buildCoreSettingsNavGroups(params),
    ...buildWorkspaceSettingsNavGroups(params),
    ...buildInfrastructureSettingsNavGroups(params),
    ...buildDomainSettingsNavGroups(params),
  ];
}
