import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LearnLanding } from '@/components/learn-landing';
import { BASE_URL } from '@/constants/common';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const isVietnamese = locale === 'vi';

  return createPageMetadata({
    baseUrl: BASE_URL,
    description: isVietnamese
      ? 'Theo dõi bài học, luyện tập, bài tập, điểm số và tiến độ học tập trong một không gian học tập Tuturuuu.'
      : 'Follow lessons, practice, assignments, marks, and learning progress in one focused Tuturuuu student portal.',
    indexable: true,
    locale,
    localePrefix: 'never',
    pathname: '/',
    siteName: 'Learn',
    title: isVietnamese ? 'Cổng học tập Tuturuuu' : 'Tuturuuu Student Portal',
  });
}

export default async function IndexPage() {
  const appSession = await getSatelliteAppSession('learn');

  if (appSession) redirect('/dashboard');

  return <LearnLanding dashboardHref="/login?next=/dashboard" />;
}
