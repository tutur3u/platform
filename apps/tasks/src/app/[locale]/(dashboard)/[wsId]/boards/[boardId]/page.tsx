import TaskBoardServerPage from '@tuturuuu/ui/tu-do/boards/boardId/task-board-server-page';

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export default async function Page({ params }: Props) {
  return <TaskBoardServerPage params={params} routePrefix="" />;
}
