import { Suspense } from 'react';
import LoadingStatisticCard from '@/components/loading-statistic-card';
import CoursesStatistics from '../../(dashboard)/statistics/courses';
import FlashcardsStatistics from '../../(dashboard)/statistics/flashcards';
import QuizzesStatistics from '../../(dashboard)/statistics/quizzes';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function WorkspaceEducationPage({ params }: Props) {
  const { wsId } = await params;
  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Suspense fallback={<LoadingStatisticCard className="md:col-span-2" />}>
          <CoursesStatistics wsId={wsId} className="md:col-span-2" />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <FlashcardsStatistics wsId={wsId} />
        </Suspense>

        <Suspense fallback={<LoadingStatisticCard />}>
          <QuizzesStatistics wsId={wsId} />
        </Suspense>
      </div>
    </div>
  );
}
