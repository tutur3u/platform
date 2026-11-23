import {
  MEET_SEO_COPY,
  MEET_SEO_DOMAIN_LABEL,
  type MeetSeoLocale,
} from './copy';
import { formatMeetScheduledTime } from './scheduled-time';

/** The public projection of a meeting. Nothing else may reach a link preview. */
export interface MeetSeoRoomInfo {
  title: string;
  scheduledAt: string;
  ended: boolean;
}

export type MeetOgSurface =
  | { kind: 'room'; info: MeetSeoRoomInfo | null }
  | { kind: 'landing' };

export interface MeetOgContent {
  variant: 'detailed' | 'generic' | 'landing';
  locale: MeetSeoLocale;
  eyebrow: string | null;
  title: string;
  detail: string | null;
  cta: string;
  footer: string;
  titleSize: number;
}

const MAX_TITLE = 110;

function titleSize(title: string) {
  if (title.length <= 36) return 76;
  if (title.length <= 70) return 60;
  return 48;
}

function clip(title: string) {
  const text = title.replace(/\s+/gu, ' ').trim();
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1)}…` : text;
}

/** Pure content for the link-preview card; the renderer only lays it out. */
export function buildMeetOgContent(
  surface: MeetOgSurface,
  locale: MeetSeoLocale
): MeetOgContent {
  const { card } = MEET_SEO_COPY[locale];
  const footer = MEET_SEO_DOMAIN_LABEL;
  if (surface.kind === 'landing') {
    return {
      variant: 'landing',
      locale,
      eyebrow: null,
      title: card.landingTitle,
      detail: card.landingDetail,
      cta: card.join,
      footer,
      titleSize: titleSize(card.landingTitle),
    };
  }
  const info = surface.info;
  const title = info ? clip(info.title) : '';
  if (!info || !title) {
    return {
      variant: 'generic',
      locale,
      eyebrow: null,
      title: card.genericTitle,
      detail: card.genericDetail,
      cta: card.join,
      footer,
      titleSize: titleSize(card.genericTitle),
    };
  }
  return {
    variant: 'detailed',
    locale,
    eyebrow: info.ended ? card.ended : card.invited,
    title,
    detail: info.ended
      ? null
      : formatMeetScheduledTime(info.scheduledAt, locale),
    cta: info.ended ? card.open : card.join,
    footer,
    titleSize: titleSize(title),
  };
}

/** Short stable key of what the image shows, so URLs change when content does. */
export function meetOgVersion(content: MeetOgContent): string {
  const text = [
    content.variant,
    content.locale,
    content.eyebrow ?? '',
    content.title,
    content.detail ?? '',
    content.cta,
  ].join('\u0000');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
