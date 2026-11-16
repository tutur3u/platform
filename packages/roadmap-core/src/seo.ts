/**
 * Search and link-preview metadata for the roadmap's public pages: one URL
 * per page and language, hreflang alternates, JSON-LD and the sitemap.
 * Pure functions, so every claim here is tested without a browser.
 */
import type { Lang } from './components/shared';

export const SITE = 'https://tuturuuu.com';
export type Page = 'roadmap' | 'edufest';

const PATHS: Record<Page, Record<Lang, string>> = {
  roadmap: { en: '/roadmap', vi: '/roadmap/vi' },
  edufest: {
    en: '/roadmap/workshops/edufest-2026',
    vi: '/roadmap/vi/workshops/edufest-2026',
  },
};

/** Router paths (below the /roadmap basepath) for the language switch. */
export const ROUTE_PATHS = {
  roadmap: { en: '/', vi: '/vi' },
  edufest: { en: '/workshops/edufest-2026', vi: '/vi/workshops/edufest-2026' },
} as const;

export function pagePath(page: Page, lang: Lang): string {
  return PATHS[page][lang];
}

export function pageUrl(page: Page, lang: Lang): string {
  return `${SITE}${PATHS[page][lang]}`;
}

/** The language a public pathname is served in. */
export function langFromPathname(pathname: string): Lang {
  return /^(?:\/roadmap)?\/vi(?:\/|$)/.test(pathname) ? 'vi' : 'en';
}

export const OG_LOCALE: Record<Lang, string> = { en: 'en_GB', vi: 'vi_VN' };

/** Canonical (self) plus hreflang en, vi and x-default (English). */
export function alternateLinks(page: Page, lang: Lang) {
  return [
    { rel: 'canonical', href: pageUrl(page, lang) },
    { rel: 'alternate', hrefLang: 'en', href: pageUrl(page, 'en') },
    { rel: 'alternate', hrefLang: 'vi', href: pageUrl(page, 'vi') },
    { rel: 'alternate', hrefLang: 'x-default', href: pageUrl(page, 'en') },
  ];
}

/** Title, description, Open Graph and Twitter tags for one page. */
export function socialMeta({
  page,
  lang,
  title,
  description,
  image,
  imageAlt,
}: {
  page: Page;
  lang: Lang;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
}) {
  const other: Lang = lang === 'en' ? 'vi' : 'en';
  const absoluteImage = image.startsWith('http') ? image : `${SITE}${image}`;
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: pageUrl(page, lang) },
    // Absolute: link previews fetch it without the page's base URL.
    { property: 'og:image', content: absoluteImage },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: imageAlt },
    { property: 'og:locale', content: OG_LOCALE[lang] },
    { property: 'og:locale:alternate', content: OG_LOCALE[other] },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: absoluteImage },
  ];
}

/**
 * JSON for a `<script type="application/ld+json">`. `<` is escaped so no
 * value can close the script element early.
 */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function jsonLdScript(value: unknown) {
  return { type: 'application/ld+json', children: jsonLd(value) };
}

const ORGANIZATION = {
  '@type': 'Organization',
  name: 'Tuturuuu',
  url: SITE,
};

function breadcrumbs(items: { name: string; url: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export type EventFacts = {
  isoDate: string;
  venueName: string;
  streetAddress: string;
  locality: string;
  region: string;
  country: string;
};

/** Event plus breadcrumbs for the workshop. No price: registration is not open. */
export function workshopJsonLd({
  lang,
  title,
  description,
  image,
  facts,
  crumbs,
}: {
  lang: Lang;
  title: string;
  description: string;
  image: string;
  facts: EventFacts;
  crumbs: { home: string; roadmap: string };
}) {
  const url = pageUrl('edufest', lang);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Event',
        '@id': `${pageUrl('edufest', 'en')}#event`,
        name: title,
        description,
        url,
        inLanguage: lang,
        image: [image.startsWith('http') ? image : `${SITE}${image}`],
        startDate: facts.isoDate,
        endDate: facts.isoDate,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
          '@type': 'Place',
          name: facts.venueName,
          address: {
            '@type': 'PostalAddress',
            streetAddress: facts.streetAddress,
            addressLocality: facts.locality,
            addressRegion: facts.region,
            addressCountry: facts.country,
          },
        },
        organizer: ORGANIZATION,
        maximumAttendeeCapacity: 40,
        offers: {
          '@type': 'Offer',
          url,
          availability: 'https://schema.org/PreOrder',
        },
      },
      breadcrumbs([
        { name: crumbs.home, url: SITE },
        { name: crumbs.roadmap, url: pageUrl('roadmap', lang) },
        { name: title, url },
      ]),
    ],
  };
}

/** WebPage with the product tracks as an ItemList, plus breadcrumbs. */
export function roadmapJsonLd({
  lang,
  title,
  description,
  tracks,
  crumbs,
}: {
  lang: Lang;
  title: string;
  description: string;
  tracks: { id: string; name: string }[];
  crumbs: { home: string; roadmap: string };
}) {
  const url = pageUrl('roadmap', lang);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#webpage`,
        name: title,
        description,
        url,
        inLanguage: lang,
        isPartOf: { '@type': 'WebSite', name: 'Tuturuuu', url: SITE },
        publisher: ORGANIZATION,
        mainEntity: {
          '@type': 'ItemList',
          name: title,
          numberOfItems: tracks.length,
          itemListElement: tracks.map((track, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: track.name,
            url: `${url}#track-${track.id}`,
          })),
        },
      },
      breadcrumbs([
        { name: crumbs.home, url: SITE },
        { name: crumbs.roadmap, url },
      ]),
    ],
  };
}

export const SITEMAP_PATH = '/roadmap/sitemap.xml';

const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Every public page in both languages, with alternates and the deploy time. */
export function sitemapXml(lastmod: string | null): string {
  const pages: Page[] = ['roadmap', 'edufest'];
  const urls = pages.flatMap((page) =>
    (['en', 'vi'] as const).map((lang) =>
      [
        '<url>',
        `<loc>${xml(pageUrl(page, lang))}</loc>`,
        lastmod ? `<lastmod>${xml(lastmod)}</lastmod>` : '',
        `<xhtml:link rel="alternate" hreflang="en" href="${xml(pageUrl(page, 'en'))}"/>`,
        `<xhtml:link rel="alternate" hreflang="vi" href="${xml(pageUrl(page, 'vi'))}"/>`,
        `<xhtml:link rel="alternate" hreflang="x-default" href="${xml(pageUrl(page, 'en'))}"/>`,
        '</url>',
      ]
        .filter(Boolean)
        .join('')
    )
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

export function sitemapResponse(method: string, lastmod: string | null) {
  const headers = {
    'content-type': 'application/xml; charset=utf-8',
    'x-content-type-options': 'nosniff',
  };
  if (method !== 'GET' && method !== 'HEAD')
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { ...headers, allow: 'GET, HEAD' },
    });
  return new Response(method === 'HEAD' ? null : sitemapXml(lastmod), {
    status: 200,
    headers,
  });
}
