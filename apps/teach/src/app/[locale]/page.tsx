import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { createPageMetadata } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { TeachHome } from '@/components/teach-home';
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
      ? 'Lập kế hoạch khóa học, quản lý lớp học và theo dõi tiến độ học viên với cổng giáo viên Tuturuuu.'
      : 'Plan courses, manage classrooms, and follow learner progress with the focused Tuturuuu educator portal.',
    indexable: true,
    locale,
    localePrefix: 'never',
    pathname: '/',
    siteName: 'Teach',
    title: isVietnamese
      ? 'Cổng giáo viên Tuturuuu'
      : 'Tuturuuu Educator Portal',
  });
}

export default async function TeachPage() {
  const appSession = await getSatelliteAppSession('teach');

  return (
    <TeachHome
      dashboardHref={appSession ? '/dashboard' : '/login?next=/dashboard'}
    />
  );
}
