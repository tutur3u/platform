import { getPlan } from '@tuturuuu/utils/plan-helpers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { siteConfig } from '@/constants/configs';

interface Props {
  params: Promise<{
    locale: string;
    planId: string;
  }>;
}

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { locale, planId } = await params;

  const enDescription = 'Find the best time slot for everyone, hassle-free.';
  const viDescription =
    'Tìm khung giờ tốt nhất cho mọi người, dễ hơn bao giờ hết.';

  const untitled = locale === 'vi' ? 'Kế hoạch' : 'Plan';

  const plan = await getPlan(planId);
  const planName = plan.name || untitled;

  const title = `${planName} - Tuturuuu Meet`;
  const description = locale === 'vi' ? viDescription : enDescription;

  return {
    title: {
      default: title,
      template: `%s - ${title}`,
    },
    description,
    openGraph: {
      type: 'website',
      locale,
      url: `${siteConfig.url}/${planId}`,
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
