import { TaskProgressPage } from '@tuturuuu/tasks-ui/progress/task-progress-page';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { createElement } from 'react';

export const metadata: Metadata = {
  title: 'Goals',
  description: 'Adaptive goals powered by your real task activity.',
};

export default async function GoalsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;

  return createElement(TaskProgressPage, {
    routeWsId: wsId,
    view: 'goals',
    wsId,
  });
}
