export const MIRA_LIVE_SCOPE_KEY = 'mira:default';
export const WEB_ASSISTANT_LIVE_SCOPE_KEY = 'assistant:web-dashboard';

export function assistantChatScopeKey(chatId: string) {
  return `assistant:${chatId}`;
}
