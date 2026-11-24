// Decides whether the cookie banner pre-selects the optional categories.
//
// USER decision (2026-11-24): default everything on. A pre-ticked box is not
// valid consent in the EU/EEA, the UK and Switzerland (CJEU Planet49,
// C-673/17) or under Vietnam's Personal Data Protection Law (silence,
// inactivity and pre-ticked boxes are not consent), so those visitors start
// with optional categories off. Nothing optional runs before the visitor makes
// a choice in either case. See apps/docs/platform/data-protection-standard.mdx,
// "Product analytics consent".

export type PrivacyRegion = 'restricted' | 'default-on';

// European time zones outside Europe/* that belong to EEA, UK or Swiss
// territory. Over-matching (for example Europe/Istanbul) only makes the
// default stricter.
const RESTRICTED_TIME_ZONES = new Set([
  'Arctic/Longyearbyen',
  'Atlantic/Azores',
  'Atlantic/Canary',
  'Atlantic/Faeroe',
  'Atlantic/Faroe',
  'Atlantic/Madeira',
  'Atlantic/Reykjavik',
  'Asia/Ho_Chi_Minh',
  'Asia/Saigon',
  'Asia/Nicosia',
  'Asia/Famagusta',
  'GB',
  'Iceland',
  'Eire',
]);

function restrictedTimeZone(timeZone: string): boolean {
  return timeZone.startsWith('Europe/') || RESTRICTED_TIME_ZONES.has(timeZone);
}

function restrictedLanguage(language: string): boolean {
  // Vietnam's law also covers Vietnamese citizens abroad.
  return /^vi(?:-|$)/i.test(language.trim());
}

export function resolvePrivacyRegion({
  timeZone,
  languages,
  locale,
}: {
  timeZone: string | null | undefined;
  languages: readonly string[];
  locale?: string | null;
}): PrivacyRegion {
  // An unknown time zone cannot rule out a restricted visitor.
  if (!timeZone) return 'restricted';
  if (restrictedTimeZone(timeZone)) return 'restricted';
  if (locale && restrictedLanguage(locale)) return 'restricted';
  if (languages.some(restrictedLanguage)) return 'restricted';
  return 'default-on';
}

export function detectPrivacyRegion(locale?: string | null): PrivacyRegion {
  try {
    return resolvePrivacyRegion({
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      languages:
        typeof navigator === 'undefined'
          ? []
          : (navigator.languages ?? [navigator.language]).filter(Boolean),
      locale,
    });
  } catch {
    return 'restricted';
  }
}

export function optionalDefaultOn(region: PrivacyRegion): boolean {
  return region === 'default-on';
}
