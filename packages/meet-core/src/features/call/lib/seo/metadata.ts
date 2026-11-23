import { meetCanonicalUrl } from '@tuturuuu/utils/meet-url';
import { decodeRoomCode, encodeRoomCode } from '../room-code';
import {
  MEET_SEO_COPY,
  MEET_SEO_SITE_NAME,
  type MeetSeoLocale,
  resolveMeetSeoLocale,
} from './copy';
import {
  buildMeetOgContent,
  type MeetOgSurface,
  type MeetSeoRoomInfo,
  meetOgVersion,
} from './og-content';
import { formatMeetScheduledTime } from './scheduled-time';

export type MeetSeoSurface =
  | { kind: 'room'; code: string; info: MeetSeoRoomInfo | null }
  | { kind: 'landing' }
  | { kind: 'page'; path: string; title?: string };

export interface MeetSeo {
  title: string;
  description: string;
  canonical: string;
  /** hreflang to absolute URL, including `x-default`. */
  languages: Record<MeetSeoLocale | 'x-default', string>;
  indexable: boolean;
  openGraph: {
    title: string;
    description: string;
    url: string;
    siteName: string;
    locale: string;
    type: 'website';
    image: { url: string; width: 1200; height: 630; alt: string };
  };
}

function localized(locale: MeetSeoLocale, path: string) {
  return meetCanonicalUrl(`${locale === 'vi' ? '/vi' : ''}${path}`);
}

function roomPath(code: string) {
  const id = decodeRoomCode(code);
  return `/r/${id ? encodeRoomCode(id) : encodeURIComponent(code)}`;
}

/** Search and link-preview metadata. Only public-safe room details are used. */
export function buildMeetSeo(
  surface: MeetSeoSurface,
  localeInput: string
): MeetSeo {
  const locale = resolveMeetSeoLocale(localeInput);
  const copy = MEET_SEO_COPY[locale];
  const path =
    surface.kind === 'room'
      ? roomPath(surface.code)
      : surface.kind === 'page'
        ? surface.path
        : '';
  const ogSurface: MeetOgSurface =
    surface.kind === 'room'
      ? { kind: 'room', info: surface.info }
      : { kind: 'landing' };
  const content = buildMeetOgContent(ogSurface, locale);
  const version = meetOgVersion(content);
  const canonical = localized(locale, path);

  let title: string;
  let description: string;
  if (surface.kind === 'room') {
    const info = surface.info;
    const publicTitle = info?.title.trim();
    if (info && publicTitle) {
      title = copy.publicRoomTitle.replace('{title}', () => publicTitle);
      const when = info.ended
        ? null
        : formatMeetScheduledTime(info.scheduledAt, locale);
      description = info.ended
        ? copy.endedRoomDescription
        : when
          ? copy.publicRoomScheduledDescription.replace('{when}', when)
          : copy.publicRoomDescription;
    } else {
      title = copy.genericRoomTitle;
      description = copy.genericRoomDescription;
    }
  } else if (surface.kind === 'page' && surface.title) {
    title = `${surface.title} | ${copy.pageTitleSuffix}`;
    description = copy.landingDescription;
  } else {
    title = copy.landingTitle;
    description = copy.landingDescription;
  }

  const imageBase =
    surface.kind === 'room'
      ? `${localized(locale, path)}/preview`
      : meetCanonicalUrl('/og');
  const imageUrl = `${imageBase}?lang=${locale}&v=${version}`;
  return {
    title,
    description,
    canonical,
    languages: {
      en: localized('en', path),
      vi: localized('vi', path),
      'x-default': localized('en', path),
    },
    indexable: surface.kind === 'landing',
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: MEET_SEO_SITE_NAME,
      locale: locale === 'vi' ? 'vi_VN' : 'en_US',
      type: 'website',
      image: {
        url: imageUrl,
        width: 1200,
        height: 630,
        alt: copy.card.imageAlt,
      },
    },
  };
}
