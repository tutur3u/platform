import { siteConfig } from '@/constants/configs';
import { Metadata } from 'next';
import { ReactNode } from 'react';

interface Props {
  params: {
    lang: string;
  };
}

export const generateMetadata = ({ params: { lang } }: Props): Metadata => {
  const viTitle = 'Họp cùng nhau | Giải pháp thay thế When2Meet, mã nguồn mở';
  const enTitle = 'Meet together | The Open Source When2Meet Alternative';

  const enDescription = 'Find the best time slot for everyone, hassle-free.';
  const viDescription =
    'Tìm khung giờ tốt nhất cho mọi người, dễ hơn bao giờ hết.';

  const title = lang === 'vi' ? viTitle : enTitle;
  const description = lang === 'vi' ? viDescription : enDescription;

  return {
    title: {
      default: title,
      template: `%s - ${siteConfig.name}`,
    },
    description,
    keywords: [
      'When2Meet',
      'Schedule meeting',
      'Find common time',
      'Find the best time',
      'Best time slot for everyone',
    ],
    authors: [
      {
        name: 'vohoangphuc',
        url: 'https://www.vohoangphuc.com',
      },
    ],
    creator: 'vohoangphuc',
    openGraph: {
      type: 'website',
      locale: lang,
      url: siteConfig.url,
      title,
      description,
      siteName: siteConfig.name,
      images: [
        {
          url: siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: `${title} - ${siteConfig.name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [siteConfig.ogImage],
      creator: '@tutur3u',
    },
  };
};

export default async function MeetTogetherLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
