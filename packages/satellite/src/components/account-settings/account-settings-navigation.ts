import { Laptop, Shield, User, Users } from '@tuturuuu/icons';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SHARED_SETTINGS_TAB_IDS } from '@tuturuuu/ui/hooks/settings-dialog-url';

export type AccountSettingsTranslator = (key: string) => string;

/** Account tabs every satellite settings dialog exposes, in display order. */
export const ACCOUNT_SETTINGS_TAB_IDS = [
  SHARED_SETTINGS_TAB_IDS.profile,
  SHARED_SETTINGS_TAB_IDS.accounts,
  SHARED_SETTINGS_TAB_IDS.security,
  SHARED_SETTINGS_TAB_IDS.sessions,
] as const;

export type AccountSettingsTabId = (typeof ACCOUNT_SETTINGS_TAB_IDS)[number];

/** Tabs whose changes need web step-up auth, so satellites link out to web. */
export const WEB_MANAGED_ACCOUNT_TAB_IDS = [
  SHARED_SETTINGS_TAB_IDS.accounts,
  SHARED_SETTINGS_TAB_IDS.security,
  SHARED_SETTINGS_TAB_IDS.sessions,
] as const;

export type WebManagedAccountTabId =
  (typeof WEB_MANAGED_ACCOUNT_TAB_IDS)[number];

export function isAccountSettingsTab(
  tab: string | null | undefined
): tab is AccountSettingsTabId {
  return (ACCOUNT_SETTINGS_TAB_IDS as readonly string[]).includes(tab ?? '');
}

export function isWebManagedAccountTab(
  tab: string | null | undefined
): tab is WebManagedAccountTabId {
  return (WEB_MANAGED_ACCOUNT_TAB_IDS as readonly string[]).includes(tab ?? '');
}

export function createAccountSettingsNavGroup(
  t: AccountSettingsTranslator
): SettingsNavGroup {
  return {
    label: t('satellite-account-settings.title'),
    items: [
      {
        description: t('satellite-account-settings.profile_description'),
        icon: User,
        keywords: ['Profile', 'Account', 'Avatar', 'Name', 'Email'],
        label: t('satellite-account-settings.profile'),
        name: SHARED_SETTINGS_TAB_IDS.profile,
      },
      {
        description: t('satellite-account-settings.accounts_description'),
        icon: Users,
        keywords: ['Accounts', 'Switch account', 'Multiple accounts'],
        label: t('satellite-account-settings.accounts'),
        name: SHARED_SETTINGS_TAB_IDS.accounts,
      },
      {
        description: t('satellite-account-settings.security_description'),
        icon: Shield,
        keywords: [
          'Security',
          'Password',
          'Two-factor',
          '2FA',
          'MFA',
          'Passkeys',
          'SSO',
        ],
        label: t('satellite-account-settings.security'),
        name: SHARED_SETTINGS_TAB_IDS.security,
      },
      {
        description: t('satellite-account-settings.sessions_description'),
        icon: Laptop,
        keywords: ['Sessions', 'Devices', 'Sign out'],
        label: t('satellite-account-settings.sessions'),
        name: SHARED_SETTINGS_TAB_IDS.sessions,
      },
    ],
  };
}
