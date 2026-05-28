export const chatQueryKeys = {
  all: (wsId: string) => ['chat', wsId] as const,
  conversations: (wsId: string) =>
    [...chatQueryKeys.all(wsId), 'conversations'] as const,
  directory: (wsId: string, query: string) =>
    [...chatQueryKeys.all(wsId), 'directory', query] as const,
  friendRequests: (wsId: string) =>
    [...chatQueryKeys.all(wsId), 'friend-requests'] as const,
  messages: (wsId: string, conversationId: string, limit: number) =>
    [...chatQueryKeys.all(wsId), 'messages', conversationId, limit] as const,
  search: (wsId: string, query: string) =>
    [...chatQueryKeys.all(wsId), 'search', query] as const,
};
