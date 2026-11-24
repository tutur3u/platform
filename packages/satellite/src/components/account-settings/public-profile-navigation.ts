import { IdCard } from '@tuturuuu/icons';
import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import { SHARED_SETTINGS_TAB_IDS } from '@tuturuuu/ui/hooks/settings-dialog-url';

/** The account Public profile tab, shared by apps/web and every satellite. */
export function createPublicProfileNavItem(
  t: (key: string) => string
): SettingsNavGroup['items'][number] {
  return {
    description: t('public_profile.tab_description'),
    icon: IdCard,
    keywords: ['Profile', 'Public profile', 'Share', 'Username', 'Bio'],
    label: t('public_profile.tab_label'),
    name: SHARED_SETTINGS_TAB_IDS.publicProfile,
  };
}
