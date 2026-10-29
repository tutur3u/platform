import { EducationContentSurface } from '@tuturuuu/ui/custom/education/shell/education-content-surface';
import { EducationPageHeader } from '@tuturuuu/ui/custom/education/shell/education-page-header';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import { requireTeachWorkspaceMember } from '@/lib/require-teach-workspace-member';
import CoursesStatistics from '../../(dashboard)/statistics/courses';
import FlashcardsStatistics from '../../(dashboard)/statistics/flashcards';
import QuizzesStatistics from '../../(dashboard)/statistics/quizzes';

export const metadata: Metadata = {
  title: 'Education',
  description: 'Manage Education in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceEducationPage({ params }: Props) {
  const t = await getTranslations();
  const { wsId: routeWsId } = await params;
  const permissions = await requireTeachWorkspaceMember(routeWsId, 'ai_lab');

  return (
    <div className="flex min-h-full w-full flex-col gap-5 p-4">
      <EducationPageHeader
        title={t('sidebar_tabs.education')}
        description={t('workspace-education-tabs.overview_description')}
      />

      <EducationContentSurface pattern>
        <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Suspense
            fallback={<LoadingStatisticCard className="md:col-span-2" />}
          >
            <CoursesStatistics
              wsId={permissions.wsId}
              permissions={permissions}
              className="md:col-span-2"
            />
          </Suspense>

          <Suspense fallback={<LoadingStatisticCard />}>
            <FlashcardsStatistics
              wsId={permissions.wsId}
              permissions={permissions}
            />
          </Suspense>

          <Suspense fallback={<LoadingStatisticCard />}>
            <QuizzesStatistics
              wsId={permissions.wsId}
              permissions={permissions}
            />
          </Suspense>
        </div>
      </EducationContentSurface>
    </div>
  );
}
