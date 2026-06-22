export const defaultLocale = 'en' as const;
export const supportedLocales = ['en', 'vi'] as const;
export const localeCookieName = 'NEXT_LOCALE';

export type Locale = (typeof supportedLocales)[number];
export type LocaleSource = 'accept-language' | 'cookie' | 'default' | 'path';

export type LocaleResolution = {
  locale: Locale;
  source: LocaleSource;
};

export type LocaleRequestInput = {
  acceptLanguageHeader?: string | null;
  cookieHeader?: string | null;
  pathname?: string | null;
};

type ParsedPath = {
  pathname: string;
  suffix: string;
};

export function isSupportedLocale(value: unknown): value is Locale {
  return getSupportedLocale(value) !== null;
}

export function normalizePathname(value?: string | null) {
  const rawPathname = parsePath(value ?? '/').pathname;
  const withSlash = rawPathname.startsWith('/')
    ? rawPathname
    : `/${rawPathname}`;
  const normalized = withSlash.replace(/\/{2,}/gu, '/');

  if (normalized.length > 1 && normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }

  return normalized || '/';
}

export function getLocaleFromPathname(pathname?: string | null) {
  const [firstSegment] = normalizePathname(pathname).split('/').filter(Boolean);
  return getSupportedLocale(firstSegment);
}

export function stripLocaleFromPathname(value?: string | null) {
  const { pathname, suffix } = parsePath(value ?? '/');
  const segments = normalizePathname(pathname).split('/').filter(Boolean);

  if (!isSupportedLocale(segments[0])) {
    return `${normalizePathname(pathname)}${suffix}`;
  }

  const stripped = segments.slice(1).join('/');
  return `${stripped ? `/${stripped}` : '/'}${suffix}`;
}

export function withLocalePrefix(
  value: string,
  locale: Locale,
  options: { localePrefix?: 'always' | 'as-needed' } = {}
) {
  const { suffix } = parsePath(value);
  const pathname = normalizePathname(stripLocaleFromPathname(value));
  const prefixMode = options.localePrefix ?? 'as-needed';

  if (prefixMode === 'as-needed' && locale === defaultLocale) {
    return `${pathname}${suffix}`;
  }

  return `/${locale}${pathname === '/' ? '' : pathname}${suffix}`;
}

export function parseCookieHeader(cookieHeader?: string | null) {
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValueParts] = part.split('=');
    const name = rawName?.trim();

    if (!name) {
      continue;
    }

    const rawValue = rawValueParts.join('=').trim();
    cookies.set(name, safeDecodeURIComponent(rawValue));
  }

  return cookies;
}

export function getLocaleFromCookieHeader(cookieHeader?: string | null) {
  const locale = parseCookieHeader(cookieHeader).get(localeCookieName);
  return getSupportedLocale(locale);
}

export function getLocaleFromAcceptLanguage(header?: string | null) {
  if (!header) {
    return null;
  }

  const candidates = header
    .split(',')
    .map((entry, index) => {
      const [tagPart, ...parameters] = entry.trim().split(';');
      const tag = tagPart?.trim().toLowerCase();
      const q = parameters.reduce((quality, parameter) => {
        const match = parameter
          .trim()
          .match(/^q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/u);
        return match?.[1] ? Number.parseFloat(match[1]) : quality;
      }, 1);

      return { index, locale: normalizeLanguageTag(tag), q };
    })
    .filter(
      (candidate): candidate is { index: number; locale: Locale; q: number } =>
        candidate.locale !== null && candidate.q > 0
    )
    .sort((left, right) => right.q - left.q || left.index - right.index);

  return candidates[0]?.locale ?? null;
}

export function resolveLocaleFromRequest(
  input: LocaleRequestInput = {}
): LocaleResolution {
  const localeFromPath = getLocaleFromPathname(input.pathname);

  if (localeFromPath) {
    return { locale: localeFromPath, source: 'path' };
  }

  const localeFromCookie = getLocaleFromCookieHeader(input.cookieHeader);

  if (localeFromCookie) {
    return { locale: localeFromCookie, source: 'cookie' };
  }

  const localeFromAcceptLanguage = getLocaleFromAcceptLanguage(
    input.acceptLanguageHeader
  );

  if (localeFromAcceptLanguage) {
    return { locale: localeFromAcceptLanguage, source: 'accept-language' };
  }

  return { locale: defaultLocale, source: 'default' };
}

function parsePath(value: string): ParsedPath {
  const match = value.match(/^([^?#]*)(.*)$/u);
  return {
    pathname: match?.[1] || '/',
    suffix: match?.[2] || '',
  };
}

function normalizeLanguageTag(value?: string) {
  if (!value || value === '*') {
    return null;
  }

  const normalized = value.toLowerCase();
  const baseLanguage = normalized.split('-')[0];

  return (
    supportedLocales.find(
      (locale) => locale === normalized || locale === baseLanguage
    ) ?? null
  );
}

function getSupportedLocale(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.toLowerCase();
  return supportedLocales.find((locale) => locale === normalized) ?? null;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
