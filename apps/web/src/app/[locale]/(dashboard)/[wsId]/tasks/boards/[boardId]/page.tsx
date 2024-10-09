import { createClient } from '@/utils/supabase/client';
import { KanbanBoard } from './kanban';

interface Props {
  params: {
    wsId?: string;
    boardId?: string;
  };
}

export default async function WorkspaceBoardEditor({
  params: { wsId, boardId },
}: Props) {
  if (!boardId) {
    return <p>No boardId provided</p>;
  }


  const { columns, tasks } = await getData(boardId);




  return (
    <KanbanBoard 
      wsId={wsId} 
      defaultCols={columns} 
      initialTasks={tasks} 
      boardId={boardId} 
    />
  );
}

async function getData(boardId: string) {
  const supabase = createClient();

  // Fetch all columns for the given board
  const { data: columns, error: columnError } = await supabase
    .from('workspace_boards_columns')
    .select('*')
    .eq('boardId', boardId);

  if (columnError) {
    console.error('Error fetching columns:', columnError);
    return { columns: [], tasks: [] };
  }

  if (!columns || columns.length === 0) {
    console.warn('No columns found for this board');
    return { columns: [], tasks: [] };
  }

  // Fetch all tasks for the given columns using their column IDs
  const { data: tasks, error: taskError } = await supabase
    .from('workspace_board_tasks')
    .select('*');

  if (taskError) {
    console.error('Error fetching tasks:', taskError);
    return { columns, tasks: [] };
  }

  const processedTasks = tasks.map((task, index) => ({
    id: task.id ?? '', // Ensure task ID is set
    columnId: task.columnId ?? '', // Ensure columnId is set
    content: task.content ?? 'No Content',
    position: task.position != null ? task.position : index + 1,
    created_at: task.created_at ?? '',
    updated_at: task.updated_at ?? '',
  }));

  return { columns, tasks: processedTasks };
}
