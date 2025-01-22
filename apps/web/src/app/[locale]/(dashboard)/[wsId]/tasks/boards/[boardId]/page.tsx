import { KanbanBoard } from './kanban';
import { getTaskBoard } from '@/lib/task-helper';
import { createClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    boardId: string;
  }>;
}

export default async function TaskBoardPage({ params }: Props) {
  const { wsId, boardId } = await params;
  const supabase = await createClient();

  try {
    const board = await getTaskBoard(supabase, boardId);
    if (!board || board.ws_id !== wsId) notFound();

    return (
      <div className="h-[calc(100vh-4rem)]">
        <KanbanBoard boardId={boardId} />
      </div>
    );
    // eslint-disable-next-line no-unused-vars
  } catch (error) {
    notFound();
  }
}
