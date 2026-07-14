import { TaskProgressPage } from '@tuturuuu/ui/tu-do/progress/task-progress-page';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { createElement } from 'react';

export const metadata: Metadata = {
  title: 'Leaderboard',
  description: 'A live workspace leaderboard powered by completed work.',
};

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  await connection();
  const { wsId } = await params;

  return createElement(TaskProgressPage, {
    routeWsId: wsId,
    view: 'leaderboards',
    wsId,
  });
}
