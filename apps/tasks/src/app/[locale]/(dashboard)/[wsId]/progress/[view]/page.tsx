import {
  TaskProgressPage,
  type TaskProgressView,
} from '@tuturuuu/ui/tu-do/progress/task-progress-page';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
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

  return (
    <TaskProgressPage
      routeWsId={wsId}
      view={view as TaskProgressView}
      wsId={wsId}
    />
  );
}
