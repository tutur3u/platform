import type { ChatConversationScope } from '@tuturuuu/ui/chat/utils';

interface ChatWorkspaceScopeSummary {
  personal?: boolean | null;
}

export function getDefaultChatConversationScope(workspace: {
  personal?: boolean | null;
}): ChatConversationScope {
  return workspace.personal ? 'personal' : 'workspaces';
}

export function getPersonalChatWorkspace<T extends ChatWorkspaceScopeSummary>(
  workspaces: T[]
): T | undefined {
  return workspaces.find((workspace) => workspace.personal);
}

export function getChatRailWorkspaces<T extends ChatWorkspaceScopeSummary>(
  workspaces: T[]
): T[] {
  return workspaces.filter((workspace) => !workspace.personal);
}
