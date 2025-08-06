import { getChats } from '../../chat/helper';
import { getAssignedTasks } from './task-fetcher';
import TasksSidebarContent from './tasks-sidebar-content';
import { getCurrentUser } from '@tuturuuu/utils/user-helper';
import {
  getPermissions,
  verifyHasSecrets,
} from '@tuturuuu/utils/workspace-helper';

interface TasksSidebarProps {
  wsId: string;
  locale: string;
}

const hasKey = (key: string) => {
  const keyEnv = process.env[key];
  return !!keyEnv && keyEnv.length > 0;
};

export default async function TasksSidebar({
  wsId,
  locale,
}: TasksSidebarProps) {
  const user = await getCurrentUser();
  
  if (!user?.id) {
    return <div>Error: User not found</div>;
  }

  const assignedTasks = await getAssignedTasks(user.id);

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
      tasks={assignedTasks}
      hasKeys={hasKeys}
      chats={chats}
      count={count}
      locale={locale}
      hasAiChatAccess={hasAiChatAccess}
    />
  );
}
