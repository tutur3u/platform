export const chatQueryKeys = {
  all: (wsId: string) => ['chat', wsId] as const,
  aiObservability: (wsId: string, conversationId: string) =>
    [...chatQueryKeys.all(wsId), 'ai-observability', conversationId] as const,
  aiSettings: (wsId: string, conversationId: string) =>
    [...chatQueryKeys.all(wsId), 'ai-settings', conversationId] as const,
  attachmentUrl: (wsId: string, conversationId: string, attachmentId: string) =>
    [
      ...chatQueryKeys.all(wsId),
      'attachments',
      conversationId,
      attachmentId,
    ] as const,
  conversations: (wsId: string, archived = 'active') =>
    [...chatQueryKeys.all(wsId), 'conversations', archived] as const,
  directory: (wsId: string, query: string) =>
    [...chatQueryKeys.all(wsId), 'directory', query] as const,
  friendRequests: (wsId: string) =>
    [...chatQueryKeys.all(wsId), 'friend-requests'] as const,
  linkPreviews: (wsId: string, conversationId: string, urls: string[]) =>
    [
      ...chatQueryKeys.all(wsId),
      'link-previews',
      conversationId,
      ...urls,
    ] as const,
  messages: (wsId: string, conversationId: string, limit: number) =>
    [...chatQueryKeys.all(wsId), 'messages', conversationId, limit] as const,
  search: (wsId: string, query: string) =>
    [...chatQueryKeys.all(wsId), 'search', query] as const,
  sharedContent: (wsId: string, conversationId: string) =>
    [...chatQueryKeys.all(wsId), 'shared-content', conversationId] as const,
};
