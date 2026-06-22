import {
  type Locale,
  type LocaleSource,
  parseCookieHeader,
  resolveLocaleFromRequest,
} from './locale';
import {
  normalizeThemePreference,
  type ThemePreference,
  themeStorageKey,
} from './theme';

export type SessionHydrationInput = {
  acceptLanguageHeader?: string | null;
  cookieHeader?: string | null;
  now?: Date;
  pathname?: string | null;
};

export type SessionHydrationSnapshot = {
  checkedAt: string;
  hasSessionCookie: boolean;
  locale: Locale;
  localeSource: LocaleSource;
  theme: ThemePreference;
};

const authCookieMatchers = [
  /^sb-.+-auth-token$/u,
  /^sb-.+-auth-token-code-verifier$/u,
  /^sb-access-token$/u,
  /^sb-refresh-token$/u,
  /^__session$/u,
];

export function hasAuthSessionCookie(cookieHeader?: string | null) {
  const cookies = parseCookieHeader(cookieHeader);

  for (const name of cookies.keys()) {
    if (authCookieMatchers.some((matcher) => matcher.test(name))) {
      return true;
    }
  }

  return false;
}

export function createSessionHydrationSnapshot(
  input: SessionHydrationInput = {}
): SessionHydrationSnapshot {
  const localeResolution = resolveLocaleFromRequest(input);
  const cookies = parseCookieHeader(input.cookieHeader);

  return {
    checkedAt: (input.now ?? new Date()).toISOString(),
    hasSessionCookie: hasAuthSessionCookie(input.cookieHeader),
    locale: localeResolution.locale,
    localeSource: localeResolution.source,
    theme: normalizeThemePreference(cookies.get(themeStorageKey)),
  };
}
