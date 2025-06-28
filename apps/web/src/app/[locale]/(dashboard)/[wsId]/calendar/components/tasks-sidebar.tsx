import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  WorkspaceTask,
  WorkspaceTaskBoard,
  WorkspaceTaskList,
} from '@tuturuuu/types/db';
import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';
import { getChats } from '../../chat/helper';
import TasksSidebarContent from './tasks-sidebar-content';

interface TasksSidebarProps {
  wsId: string;
  locale: string;
}

async function getTaskBoardsWithDetails(
  wsId: string
): Promise<Partial<WorkspaceTaskBoard>[]> {
  const supabase = await createClient();

  const { data: boardsData, error: boardsError } = await supabase
    .from('workspace_boards')
    .select('id, name, created_at, ws_id')
    .eq('ws_id', wsId)
    .order('name', { ascending: true })
    .limit(10);

  if (boardsError) {
    console.error('Error fetching task boards:', boardsError);
    return [];
  }

  if (!boardsData) return [];

  const enrichedBoards: Partial<WorkspaceTaskBoard>[] = [];

  for (const board of boardsData as Partial<WorkspaceTaskBoard>[]) {
    if (!board.id) continue;

    // Cast to EnrichedTaskBoard early
    const { data: listsData, error: listsError } = await supabase
      .from('task_lists')
      .select('id, name, board_id, created_at')
      .eq('board_id', board.id)
      .order('created_at', { ascending: true });

    const currentBoardLists: Partial<WorkspaceTaskList>[] = [];
    if (listsError) {
      console.error(`Error fetching lists for board ${board.id}:`, listsError);
      // Board will have an empty lists array by default if not assigned
    } else if (listsData) {
      for (const list of listsData as Partial<WorkspaceTaskList>[]) {
        if (!list.id) continue;

        // Cast to EnrichedTaskList
        const { data: tasksData, error: tasksError } = await supabase
          .from('tasks')
          .select(
            'id, name, list_id, created_at, priority, end_date, description'
          ) // Added status back, and description
          .eq('list_id', list.id)
          .order('created_at', { ascending: true });

        if (tasksError) {
          console.error(
            `Error fetching tasks for list ${list.id}:`,
            tasksError
          );
          currentBoardLists.push({ ...list, tasks: [] });
        } else {
          currentBoardLists.push({
            ...list,
            tasks: (tasksData as Partial<WorkspaceTask>[]) || [],
          });
        }
      }
    }
    enrichedBoards.push({ ...board, lists: currentBoardLists });
  }

  return enrichedBoards;
}

const hasKey = (key: string) => {
  const keyEnv = process.env[key];
  return !!keyEnv && keyEnv.length > 0;
};

export default async function TasksSidebar({
  wsId,
  locale,
}: TasksSidebarProps) {
  const taskBoardsWithDetails = await getTaskBoardsWithDetails(wsId);

  // Check permissions and secrets for AI chat
  const { withoutPermission } = await getPermissions({ wsId });
  let hasAiChatAccess = false;
  let chats: any[] = [];
  let count = 0;

  try {
    // Check if user has AI chat permission and secrets are configured
    if (!withoutPermission('ai_chat')) {
      await verifyHasSecrets(wsId, ['ENABLE_CHAT']);
      hasAiChatAccess = true;

      // Only fetch chat data if user has access
      const chatData = await getChats();
      chats = chatData.data || [];
      count = chatData.count || 0;
    }
  } catch (error) {
    // If verification fails, user doesn't have access
    console.log('AI Chat access denied:', error);
    hasAiChatAccess = false;
  }

  // Check for API keys
  const hasKeys = {
    openAI: hasKey('OPENAI_API_KEY'),
    anthropic: hasKey('ANTHROPIC_API_KEY'),
    google: hasKey('GOOGLE_GENERATIVE_AI_API_KEY'),
  };

  return (
    <TasksSidebarContent
      wsId={wsId}
      initialTaskBoards={taskBoardsWithDetails}
      hasKeys={hasKeys}
      chats={chats}
      count={count}
      locale={locale}
      hasAiChatAccess={hasAiChatAccess}
    />
  );
}
