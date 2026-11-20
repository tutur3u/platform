export const LMS_AREAS = ['teach', 'learn'] as const;
export type LmsArea = (typeof LMS_AREAS)[number];

export const LMS_AREA_LOCALES = ['en', 'vi'] as const;
export type LmsAreaLocale = (typeof LMS_AREA_LOCALES)[number];

export function isLmsAreaLocale(locale: string): locale is LmsAreaLocale {
  return locale === 'en' || locale === 'vi';
}

/** Home of an LMS area, including the locale the receiving shell stores. */
export function lmsAreaHomeHref(area: LmsArea, locale: string): string | null {
  if (!isLmsAreaLocale(locale)) return null;
  return `/lms/${area}/${locale}/dashboard`;
}

/**
 * Link to the other area's home. A caller that failed the other area's
 * access check passes `otherAreaAllowed: false`, and no link is returned.
 */
export function lmsAreaSwitchHref({
  current,
  locale,
  otherAreaAllowed,
}: {
  current: LmsArea;
  locale: string;
  otherAreaAllowed: boolean;
}): string | null {
  if (!otherAreaAllowed) return null;
  const other = current === 'teach' ? 'learn' : 'teach';
  return lmsAreaHomeHref(other, locale);
}

/** Current workspace first, then the account's other workspaces, once each. */
export function lmsAreaWorkspaceOrder(
  currentWsId: string,
  workspaceIds: readonly string[]
): string[] {
  return [...new Set([currentWsId, ...workspaceIds].filter(Boolean))];
}

export async function resolveLmsAreaSwitchHref({
  current,
  locale,
  workspaceIds,
  hasOtherAreaAccess,
}: {
  current: LmsArea;
  locale: string;
  workspaceIds: readonly string[];
  hasOtherAreaAccess: (wsId: string) => Promise<boolean>;
}): Promise<string | null> {
  let otherAreaAllowed = false;
  for (const wsId of workspaceIds) {
    if (await hasOtherAreaAccess(wsId)) {
      otherAreaAllowed = true;
      break;
    }
  }
  return lmsAreaSwitchHref({ current, locale, otherAreaAllowed });
}
