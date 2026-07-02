import {
  BriefcaseBusiness,
  ClipboardList,
  Compass,
  CreditCard,
  Keyboard,
  Shield,
} from '@tuturuuu/icons';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import type { SettingsNavBuilderParams } from './settings-dialog-nav-types';

export function buildInfrastructureSettingsNavGroups({
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
      availability.canAccessInternalProjects ||
      availability.canAccessPlatformRoles ||
      availability.canAccessPlatformBilling ||
      availability.canAccessInquiries
    )
  ) {
    return [];
  }

  return [
    {
      label: t('workspace-settings-layout.infrastructure'),
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
        ...(availability.canAccessPlatformRoles
          ? [
              {
                name: 'platform_roles',
                label: t('workspace-settings-layout.platform_roles'),
                icon: Shield,
                keywords: ['Platform', 'Roles', 'Access'],
              },
            ]
          : []),
        ...(availability.canAccessPlatformBilling
          ? [
              {
                name: 'platform_billing',
                label: 'Platform Billing',
                icon: CreditCard,
                keywords: ['Platform', 'Billing', 'Subscription'],
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
        ...buildInfrastructureRouteItems({ availability, t }),
      ],
    },
  ];
}

function buildInfrastructureRouteItems({
  availability,
  t,
}: Pick<SettingsNavBuilderParams, 'availability' | 't'>) {
  return availability.canAccessInternalProjects
    ? [
        {
          name: 'internal_projects',
          label: t('infrastructure-tabs.internal_projects'),
          icon: BriefcaseBusiness,
          keywords: [
            'Infrastructure',
            'Internal Projects',
            'CMS',
            'External Projects',
          ],
        },
      ]
    : [];
}
