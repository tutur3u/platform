import {
  getSatelliteAppSession,
  getSatelliteCurrentUser,
} from '@tuturuuu/satellite/auth';
import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
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
    pathname: '/',
    siteName: 'Learn',
    title: isVietnamese ? 'Cổng học tập Tuturuuu' : 'Tuturuuu Student Portal',
  });
}

function firstNonBlank(values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }

  return null;
}

export default async function IndexPage() {
  const appSession = await getSatelliteAppSession('learn');
  const currentUser = appSession
    ? await getSatelliteCurrentUser('learn')
    : null;
  const userName = firstNonBlank([
    currentUser?.display_name,
    currentUser?.full_name,
    currentUser?.email,
  ]);

  return (
    <LearnLanding
      dashboardHref={appSession ? '/dashboard' : '/login?next=/dashboard'}
      isAuthenticated={Boolean(appSession)}
      userName={userName}
    />
  );
}
