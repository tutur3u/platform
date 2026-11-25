import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { defaultLocale, type Locale, supportedLocales } from '@/i18n/routing';

/**
 * Apex path of the Documents app. The Documentation site lives separately at
 * https://docs.tuturuuu.com; links to it must use that origin directly.
 */
export const DOCUMENTS_APP_PATH = '/docs';

export function getDocumentsAppEntryTarget(
  workspace: { id: string; personal?: boolean | null } | null | undefined,
  locale?: string
) {
  const slug = workspace
    ? toWorkspaceSlug(workspace.id, { personal: Boolean(workspace.personal) })
    : 'personal';
  const prefix =
    locale &&
    locale !== defaultLocale &&
    supportedLocales.includes(locale as Locale)
      ? `/${locale}`
      : '';

  return `${prefix}/${slug}/documents`;
}

export function getDocumentsAppLoginTarget(locale?: string) {
  const prefix =
    locale &&
    locale !== defaultLocale &&
    supportedLocales.includes(locale as Locale)
      ? `/${locale}`
      : '';
  const nextUrl = `${prefix}${DOCUMENTS_APP_PATH}`;

  return `/login?nextUrl=${encodeURIComponent(nextUrl)}`;
}
