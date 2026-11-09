import { ClipboardList, Compass, Keyboard, Shield } from '@tuturuuu/icons';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import type { SettingsNavBuilderParams } from './settings-dialog-nav-types';

export function buildDeveloperSettingsNavGroups({
  availability,
  t,
  wsId,
}: SettingsNavBuilderParams): SettingsNavGroup[] {
  if (
    !wsId ||
    !(
      availability.canAccessIntegrations ||
      availability.canAccessApiKeys ||
      availability.canAccessSecrets ||
      availability.canAccessInquiries
    )
  ) {
    return [];
  }

  return [
    {
      label: t('workspace-settings-layout.developer'),
      items: [
        ...(availability.canAccessIntegrations
          ? [
              {
                name: 'integrations',
                label: t('sidebar_tabs.integrations'),
                icon: Compass,
                keywords: ['Integrations', 'Discord', 'Connections'],
              },
            ]
          : []),
        ...(availability.canAccessApiKeys
          ? [
              {
                name: 'api_keys',
                label: t('workspace-settings-layout.api_keys'),
                icon: Keyboard,
                keywords: ['API Keys', 'SDK', 'Tokens', 'Developer'],
              },
            ]
          : []),
        ...(availability.canAccessSecrets
          ? [
              {
                name: 'secrets',
                label: t('workspace-settings-layout.secrets'),
                icon: Shield,
                keywords: ['Secrets', 'Environment', 'Credentials'],
              },
            ]
          : []),
        ...(availability.canAccessInquiries
          ? [
              {
                name: 'inquiries',
                label: t('sidebar_tabs.inquiries'),
                icon: ClipboardList,
                keywords: ['Inquiries', 'Support', 'Reports'],
              },
            ]
          : []),
      ],
    },
  ];
}
