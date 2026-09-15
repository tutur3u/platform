import type { Metadata } from 'next';
import type { MeetingPublicInfo } from './meeting-public-info';
import { decodeRoomCode, encodeRoomCode } from './room-code';

export function meetingMetadata(
  code: string,
  locale: string,
  info: MeetingPublicInfo | null,
  copy: {
    title: string;
    privateDescription: string;
    join: string;
    ended: string;
  }
): Metadata {
  const language = locale === 'vi' ? 'vi' : 'en';
  const id = decodeRoomCode(code);
  const url = `https://meet.tuturuuu.com${language === 'vi' ? '/vi' : ''}/r/${id ? encodeRoomCode(id) : encodeURIComponent(code)}`;
  const title = info?.title || copy.title;
  const date =
    info && Number.isFinite(Date.parse(info.scheduledAt))
      ? `${new Intl.DateTimeFormat(language, {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'UTC',
        }).format(new Date(info.scheduledAt))} UTC`
      : null;
  const description = info
    ? `${title}${date ? ` · ${date}` : ''}. ${info.ended ? copy.ended : copy.join}`
    : copy.privateDescription;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: {
      index: !!info,
      follow: !!info,
      googleBot: { index: !!info, follow: !!info },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Tuturuuu Meet',
      type: 'website',
      locale: language === 'vi' ? 'vi_VN' : 'en_US',
      images: [
        {
          url: 'https://meet.tuturuuu.com/media/logos/og-image.png',
          width: 1200,
          height: 630,
          alt: 'Tuturuuu Meet',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['https://meet.tuturuuu.com/media/logos/og-image.png'],
    },
  };
}
