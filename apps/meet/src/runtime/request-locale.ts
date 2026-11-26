import { LOCALE_COOKIE_NAME } from '@tuturuuu/satellite/constants';

export const MEET_LOCALES = ['en', 'vi'] as const;
export type MeetLocale = (typeof MEET_LOCALES)[number];

const isMeetLocale = (value: string | null | undefined): value is MeetLocale =>
  !!value && (MEET_LOCALES as readonly string[]).includes(value);

function cookieLocale(header: string | null) {
  if (!header) return null;
  for (const entry of header.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() !== LOCALE_COOKIE_NAME) continue;
    const value = entry.slice(separator + 1).trim();
    if (isMeetLocale(value)) return value;
  }
  return null;
}

/** The best supported language in an Accept-Language header, by weight. */
function acceptedLocale(header: string | null) {
  if (!header) return null;
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return {
        language: tag.trim().toLowerCase().split('-')[0],
        weight: Number.isFinite(weight) ? weight : 0,
        index,
      };
    })
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked.find((entry) => isMeetLocale(entry.language))?.language as
    | MeetLocale
    | undefined;
}

/**
 * The locale a Meet request renders in, in order: the URL's locale segment
 * (first, or right after the `/meet` mount),
 * the proxy's `x-next-intl-locale` header, the `NEXT_LOCALE` cookie (only a
 * supported value), then the browser's Accept-Language, else English. A
 * server function call has no locale segment, so the cookie the proxy set
 * when it dropped the `/vi` prefix keeps the page in Vietnamese.
 */
export function resolveRequestLocale(request: {
  url: string;
  headers: Headers;
}): MeetLocale {
  // The locale may follow the `/meet` mount (`/meet/vi/...`) or lead it.
  const [first, second] = new URL(request.url).pathname
    .split('/')
    .filter(Boolean);
  const segment = first === 'meet' ? second : first;
  if (isMeetLocale(segment)) return segment;
  const header = request.headers.get('x-next-intl-locale');
  if (isMeetLocale(header)) return header;
  return (
    cookieLocale(request.headers.get('cookie')) ??
    acceptedLocale(request.headers.get('accept-language')) ??
    'en'
  );
}
