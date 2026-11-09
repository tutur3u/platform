import {
  Bell,
  Brain,
  Compass,
  Keyboard,
  Laptop,
  Paintbrush,
  Shield,
  Sparkles,
  User,
  Users,
} from '@tuturuuu/icons';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import type { SettingsNavBuilderParams } from './settings-dialog-nav-types';

export function buildCoreSettingsNavGroups({
  t,
  wsId,
}: SettingsNavBuilderParams): SettingsNavGroup[] {
  const groups: SettingsNavGroup[] = [
    {
      label: t('settings.user.title'),
      items: [
        {
          name: 'profile',
          label: t('settings.user.profile'),
          icon: User,
          description: t('settings.user.profile_description'),
          keywords: ['Profile'],
        },
        {
          name: 'security',
          label: t('ws-settings.security'),
          icon: Shield,
          description: t('settings-account.security-description'),
          keywords: ['Security'],
        },
        {
          name: 'sessions',
          label: t('settings.user.sessions'),
          icon: Laptop,
          description: t('settings.user.sessions_description'),
          keywords: ['Sessions', 'Devices'],
        },
        {
          name: 'accounts',
          label: t('settings-nav.accounts.name'),
          icon: Users,
          description: t('settings-nav.accounts.description'),
          keywords: ['Accounts'],
        },
      ],
    },
    {
      label: t('settings.preferences.title'),
      items: [
        {
          name: 'appearance',
          label: t('settings.preferences.appearance'),
          icon: Paintbrush,
          description: wsId
            ? t('settings.preferences.appearance_ws_description')
            : t('settings-account.appearance-description'),
          keywords: ['Appearance', 'Theme'],
        },
        {
          name: 'notifications',
          label: t('settings.preferences.notifications'),
          icon: Bell,
          description: wsId
            ? t('settings.preferences.notifications_ws_description')
            : 'Manage your notification preferences',
          keywords: ['Notifications'],
        },
        {
          name: 'navigation',
          label: t('settings.preferences.navigation.menu_label'),
          icon: Compass,
          description: t('settings.preferences.navigation.menu_description'),
          keywords: [
            'Navigation',
            'Sidebar',
            'Start page',
            'Workspace',
            'Redirect',
            'Menu',
          ],
        },
        {
          name: 'keyboard_shortcuts',
          label: t('settings.preferences.keyboard_shortcuts'),
          icon: Keyboard,
          description: t('settings.preferences.keyboard_shortcuts_description'),
          keywords: ['Keyboard', 'Shortcuts', 'Hotkeys'],
        },
      ],
    },
    {
      label: t('settings.mira.title'),
      items: [
        {
          name: 'mira_personality',
          label: t('settings.mira.personality'),
          icon: Sparkles,
          description: t('settings.mira.personality_description'),
          keywords: ['Mira', 'AI', 'Personality', 'Soul', 'Assistant'],
        },
        {
          name: 'mira_memories',
          label: t('settings.mira.memories'),
          icon: Brain,
          description: t('settings.mira.memories_description'),
          keywords: ['Mira', 'Memory', 'Remember', 'Facts'],
        },
      ],
    },
  ];

  return groups;
}
