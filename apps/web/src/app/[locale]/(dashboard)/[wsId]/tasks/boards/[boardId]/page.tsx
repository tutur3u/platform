import { KanbanBoard } from './kanban';

interface Props {
  params: {
    wsId?: string;
    boardId?: string;
  };
}

export default function WorkspaceBoardEditor(
  {
    // params: { wsId, boardId },
  }: Props
) {
  return <KanbanBoard />;
}
