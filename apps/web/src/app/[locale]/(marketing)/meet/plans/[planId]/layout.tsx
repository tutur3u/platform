import { getPlan } from '@tuturuuu/utils/plan-helpers';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getMarketingMetadata } from '@/lib/seo/marketing-metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; planId: string }>;
}): Promise<Metadata> {
  const { locale, planId } = await params;
  const plan = await getPlan(planId);
  const title = `${plan?.name || (locale === 'vi' ? 'Kế hoạch' : 'Plan')} - Tuturuuu Meet`;
  return getMarketingMetadata(
    {
      title,
      description:
        locale === 'vi'
          ? 'Tìm thời gian phù hợp cho mọi người với Tuturuuu Meet.'
          : 'Find a time that works for everyone with Tuturuuu Meet.',
      imageAlt: `${title} - Tuturuuu`,
      pathname: `/meet/plans/${planId}`,
    },
    locale
  );
}

export default function MeetPlanLayout({ children }: { children: ReactNode }) {
  return children;
}
