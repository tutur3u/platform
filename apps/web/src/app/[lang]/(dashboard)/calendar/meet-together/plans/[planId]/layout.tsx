import { getPlan } from './helpers';
import { siteConfig } from '@/constants/configs';
import { Metadata } from 'next';
import { ReactNode } from 'react';

interface Props {
  params: {
    lang: string;
    planId: string;
  };
}

export async function generateMetadata({
  params: { lang, planId },
}: Props): Promise<Metadata> {
  const viTitle = 'Họp cùng nhau';
  const enTitle = 'Meet together';

  const enDescription = 'Find the best time slot for everyone, hassle-free.';
  const viDescription =
    'Tìm khung giờ tốt nhất cho mọi người, dễ hơn bao giờ hết.';

  const untitled = lang === 'vi' ? 'Kế hoạch' : 'Plan';

  const plan = await getPlan(planId);
  const planName = plan.name || untitled;

  const title = `${planName} - ${lang === 'vi' ? viTitle : enTitle}`;
  const description = lang === 'vi' ? viDescription : enDescription;

  return {
    title: {
      default: title,
      template: `%s - ${title}`,
    },
    description,
    openGraph: {
      type: 'website',
      locale: 'en_US',
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
}

export default async function MeetTogetherLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
