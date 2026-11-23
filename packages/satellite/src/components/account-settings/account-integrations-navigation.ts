import { Blocks } from '@tuturuuu/icons';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SHARED_SETTINGS_TAB_IDS } from '@tuturuuu/ui/hooks/settings-dialog-url';

/** The account Integrations tab, shared by apps/web and every satellite. */
export function createAccountIntegrationsNavItem(
  t: (key: string) => string
): SettingsNavGroup['items'][number] {
  return {
    description: t('account-integrations.description'),
    icon: Blocks,
    keywords: [
      'Integrations',
      'Connected apps',
      'Connections',
      'Upskii',
      'Calendar',
      'Mail',
      'Google',
      'Microsoft',
      'Outlook',
      'Gmail',
    ],
    label: t('account-integrations.title'),
    name: SHARED_SETTINGS_TAB_IDS.accountIntegrations,
  };
}
