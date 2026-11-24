import {
  buildSettingsDialogHref,
  SETTINGS_MEMBERS_TAB_PARAM,
  sanitizeWorkspaceAccessTab,
} from '@tuturuuu/ui/hooks/settings-dialog-url';
import { type Locale, redirect, routing } from '@/i18n/routing';

/**
 * Sends a retired workspace settings page to the settings dialog tab that
 * replaced it, keeping the locale and, for Members, the old `?tab=` view.
 */
export function redirectToWorkspaceSettingsTab({
  locale,
  membersTab,
  tab,
  wsId,
}: {
  locale: string;
  membersTab?: string | string[];
  tab: string;
  wsId: string;
}): never {
  const accessTab = sanitizeWorkspaceAccessTab(
    Array.isArray(membersTab) ? membersTab[0] : membersTab
  );
  const targetLocale: Locale = (routing.locales as readonly string[]).includes(
    locale
  )
    ? (locale as Locale)
    : routing.defaultLocale;
  return redirect({
    href: buildSettingsDialogHref(
      `/${encodeURIComponent(wsId)}`,
      tab,
      accessTab ? { [SETTINGS_MEMBERS_TAB_PARAM]: accessTab } : undefined
    ),
    locale: targetLocale,
  });
}
