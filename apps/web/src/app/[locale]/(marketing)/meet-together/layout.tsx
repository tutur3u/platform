import { siteConfig } from '@/constants/configs';
import { Metadata } from 'next';
import { ReactNode } from 'react';

interface Props {
  params: Promise<{
    locale: string;
  }>;
}

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale } = await params;

  const viTitle = 'Họp cùng nhau | Giải pháp thay thế When2Meet, mã nguồn mở';
  const enTitle = 'Meet together | The Open Source When2Meet Alternative';

  const enDescription = 'Find the best time slot for everyone, hassle-free.';
  const viDescription =
    'Tìm khung giờ tốt nhất cho mọi người, dễ hơn bao giờ hết.';

  const title = locale === 'vi' ? viTitle : enTitle;
  const description = locale === 'vi' ? viDescription : enDescription;

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
      locale,
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
      creator: '@tuturuuu',
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
