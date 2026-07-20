import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import TaskBoardServerPage from '@tuturuuu/tasks-ui/tu-do/boards/boardId/task-board-server-page';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createElement } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export default async function Page({ params }: Props) {
  await connection();

  const user = await getSatelliteAppSessionUser('tasks');
  if (!user?.id) redirect('/login');

  return createElement(TaskBoardServerPage, {
    defaultView: 'kanban',
    params,
    routePrefix: '',
    rootLoading: true,
    sessionUser: user,
  });
}
