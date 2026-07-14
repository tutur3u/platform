import { TaskProgressPage } from '@tuturuuu/ui/tu-do/progress/task-progress-page';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { createElement } from 'react';

export const metadata: Metadata = {
  title: 'Analytics',
  description: 'Automatic task velocity, consistency, and focus insights.',
};

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;

  return createElement(TaskProgressPage, {
    routeWsId: wsId,
    view: 'stats',
    wsId,
  });
}
