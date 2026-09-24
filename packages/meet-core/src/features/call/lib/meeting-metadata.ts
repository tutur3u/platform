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
  // Link crawlers have no recipient timezone. Localize time on the landing page.
  const description = info
    ? info.ended
      ? copy.ended
      : copy.join
    : copy.privateDescription;
  const image = `${url}/preview?lang=${language}`;
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
          url: image,
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
      images: [image],
    },
  };
}
