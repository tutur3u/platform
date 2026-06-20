import { createFileRoute } from '@tanstack/react-router';
import { TaskBoardLoading } from '../../../../../components/loading/workspace-route-loading';

export const Route = createFileRoute('/$locale/$wsId/tasks/boards/$boardId')({
  component: TaskBoardLoading,
});
