import TaskBoardServerPage from '@tuturuuu/ui/tu-do/boards/boardId/task-board-server-page';
import { createElement } from 'react';

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return createElement(TaskBoardServerPage, {
    defaultView: 'kanban',
    params,
    routePrefix: '',
  });
}
