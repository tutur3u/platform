import {
  TaskProgressPage,
  type TaskProgressView,
} from '@tuturuuu/tasks-ui/progress/task-progress-page';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';

const VIEWS = new Set<TaskProgressView>([
  'progress',
  'goals',
  'stats',
  'leaderboards',
  'import',
]);

export const metadata: Metadata = {
  title: 'Progress',
  description: 'Track progress, goals, insights, and friendly competitions.',
};

export default async function ProgressViewPage({
  params,
}: {
  params: Promise<{ view: string; wsId: string }>;
}) {
  await connection();
  const { view, wsId } = await params;

  if (!VIEWS.has(view as TaskProgressView)) notFound();
  const firstClassRoute = (
    {
      goals: `/${wsId}/goals`,
      leaderboards: `/${wsId}/leaderboard`,
      progress: `/${wsId}/progress`,
      stats: `/${wsId}/analytics`,
    } as Partial<Record<TaskProgressView, string>>
  )[view as TaskProgressView];
  if (firstClassRoute) redirect(firstClassRoute);

  return (
    <TaskProgressPage
      routeWsId={wsId}
      view={view as TaskProgressView}
      wsId={wsId}
    />
  );
}
