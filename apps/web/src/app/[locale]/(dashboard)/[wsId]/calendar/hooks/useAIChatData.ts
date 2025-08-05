import { useQuery } from '@tanstack/react-query';

export function useAIChatData(wsId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ai-chat-data', wsId],
    queryFn: async () => {
      try {
        // Fetch chat data
        const chatResponse = await fetch(`/api/v1/workspaces/${wsId}/chats`);
        const chatData = chatResponse.ok ? await chatResponse.json() : { data: [], count: 0 };
        
        // Fetch AI configuration (permissions and API keys)
        const configResponse = await fetch(`/api/v1/workspaces/${wsId}/ai-config`);
        const configData = configResponse.ok ? await configResponse.json() : { 
          hasKeys: { openAI: false, anthropic: false, google: false }, 
          hasAiChatAccess: false 
        };

        return {
          chats: chatData.data || [],
          count: chatData.count || 0,
          hasKeys: configData.hasKeys || { openAI: false, anthropic: false, google: false },
          hasAiChatAccess: configData.hasAiChatAccess || false,
        };
      } catch (error) {
        console.error('Failed to fetch AI chat data:', error);
        return {
          chats: [],
          count: 0,
          hasKeys: { openAI: false, anthropic: false, google: false },
          hasAiChatAccess: false,
        };
      }
    },
    enabled,
    staleTime: 30000, // Cache for 30 seconds
  });
} 