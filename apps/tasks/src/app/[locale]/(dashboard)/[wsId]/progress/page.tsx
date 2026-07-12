import { TaskProgressPage } from '@tuturuuu/ui/tu-do/progress/task-progress-page';
import type { Metadata } from 'next';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'Progress',
  description: 'Track progress, goals, insights, and friendly competitions.',
};

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;

  return <TaskProgressPage routeWsId={wsId} view="progress" wsId={wsId} />;
}
