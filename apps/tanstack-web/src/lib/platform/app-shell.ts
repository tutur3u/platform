import { createPageHead } from './head';
import type { Locale } from './locale';
import { defaultLocale, normalizePathname, supportedLocales } from './locale';

export type AppShellRouteMatch = {
  params?: Record<string, unknown>;
  routeId?: string;
};

export type UnsupportedLocaleRouteMatch = {
  locale: string;
  routeId: string;
};

const localizedRouteIdPrefix = '/$locale';

const appShellSiteConfig = {
  description: {
    en: 'Take control of your workflow, supercharged by AI.',
    vi: 'Quản lý công việc của bạn, siêu tốc độ cùng AI.',
  },
  name: 'Tuturuuu',
  ogImage: 'https://tuturuuu.com/media/logos/og-image.jpg',
  url: 'https://tuturuuu.com',
};

function isExactSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    supportedLocales.some((locale) => locale === value)
  );
}

export function getExactLocaleFromPathname(pathname?: string | null) {
  const [firstSegment] = normalizePathname(pathname).split('/').filter(Boolean);

  return isExactSupportedLocale(firstSegment) ? firstSegment : null;
}

export function getAppShellDocumentLocale(pathname?: string | null): Locale {
  return getExactLocaleFromPathname(pathname) ?? defaultLocale;
}

export function isLocalizedRouteMatch(match: AppShellRouteMatch) {
  return (
    match.routeId === `${localizedRouteIdPrefix}/` ||
    match.routeId?.startsWith(`${localizedRouteIdPrefix}/`) === true
  );
}

export function findUnsupportedLocaleRouteMatch(
  matches: AppShellRouteMatch[]
): UnsupportedLocaleRouteMatch | null {
  for (const match of matches) {
    if (!isLocalizedRouteMatch(match)) {
      continue;
    }

    const locale = match.params?.locale;

    if (typeof locale === 'string' && !isExactSupportedLocale(locale)) {
      return {
        locale,
        routeId: match.routeId ?? localizedRouteIdPrefix,
      };
    }
  }

  return null;
}

export function hasLocalizedRouteMatch(matches: AppShellRouteMatch[]) {
  return matches.some(isLocalizedRouteMatch);
}

export function getAppShellDocumentLocaleFromMatches(
  matches: AppShellRouteMatch[]
): Locale {
  const localizedMatch = matches.find(isLocalizedRouteMatch);
  return isExactSupportedLocale(localizedMatch?.params?.locale)
    ? localizedMatch.params.locale
    : defaultLocale;
}

export function createLegacyRootLayoutHead(
  locale: Locale = defaultLocale,
  options: { stylesheets?: string[] } = {}
) {
  const description =
    locale === 'vi'
      ? appShellSiteConfig.description.vi
      : appShellSiteConfig.description.en;

  return createPageHead(
    {
      description,
      imageUrl: appShellSiteConfig.ogImage,
      locale,
      openGraphLocale: locale === 'vi' ? 'vi_VN' : 'en_US',
      title: appShellSiteConfig.name,
    },
    {
      links: [
        ...(options.stylesheets ?? []).map((href) => ({
          href,
          rel: 'stylesheet',
        })),
        { href: 'https://tuturuuu.com/favicon.ico', rel: 'icon' },
        {
          href: 'https://tuturuuu.com/favicon-16x16.png',
          rel: 'shortcut icon',
        },
        {
          href: 'https://tuturuuu.com/apple-touch-icon.png',
          rel: 'apple-touch-icon',
        },
      ],
      meta: [
        { content: appShellSiteConfig.name, name: 'application-name' },
        {
          content:
            'Tuturuuu, business management platform, AI productivity, team collaboration, workflow automation, workspace management',
          name: 'keywords',
        },
        { content: 'Tuturuuu', name: 'author' },
        { content: 'Tuturuuu', name: 'publisher' },
        { content: 'origin-when-cross-origin', name: 'referrer' },
        {
          content:
            'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
          name: 'robots',
        },
        { content: appShellSiteConfig.name, property: 'og:site_name' },
        { content: 'website', property: 'og:type' },
        {
          content: locale === 'vi' ? 'en_US' : 'vi_VN',
          property: 'og:locale:alternate',
        },
        { content: 'summary_large_image', name: 'twitter:card' },
        { content: appShellSiteConfig.name, name: 'twitter:title' },
        { content: description, name: 'twitter:description' },
        { content: appShellSiteConfig.ogImage, name: 'twitter:image' },
        { content: '@tuturuuu', name: 'twitter:creator' },
        { content: '@tuturuuu', name: 'twitter:site' },
        { content: 'yes', name: 'apple-mobile-web-app-capable' },
        { content: 'default', name: 'apple-mobile-web-app-status-bar-style' },
        {
          content: appShellSiteConfig.name,
          name: 'apple-mobile-web-app-title',
        },
        { content: 'telephone=no', name: 'format-detection' },
        { content: 'dark light', name: 'color-scheme' },
        { content: 'black', name: 'theme-color' },
      ],
    }
  );
}
