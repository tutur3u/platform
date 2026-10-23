import { buildSettingsDialogHref } from '@tuturuuu/ui/hooks/settings-dialog-url';
import type { WebManagedAccountTabId } from './account-settings-navigation';

/**
 * Opens the same tab in the web settings dialog. Account-level tabs are not
 * workspace-scoped, so the personal workspace is always a valid host route.
 */
export function buildWebAccountSettingsUrl(
  centralUrl: string,
  tab: WebManagedAccountTabId | 'profile'
): string {
  const origin = new URL(centralUrl).origin;
  return buildSettingsDialogHref(`${origin}/personal`, tab);
}
