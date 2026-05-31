'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AiMemoryItem,
  deleteWorkspaceAiMemoryItem,
  listWorkspaceAiMemoryItems,
} from '@tuturuuu/internal-api/ai-memory';

interface MiraMemory {
  id: string;
  user_id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  source?: string | null;
  last_referenced_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface MiraMemoriesResponse {
  memories: MiraMemory[];
  grouped: Record<string, MiraMemory[]>;
  total: number;
}

const miraMemoriesKeys = {
  all: ['mira-memories'] as const,
  list: () => [...miraMemoriesKeys.all, 'list'] as const,
};

function mapAiMemoryItemToMiraMemory(item: AiMemoryItem): MiraMemory {
  const metadata = item.metadata ?? {};
  const category =
    typeof metadata.memoryCategory === 'string'
      ? metadata.memoryCategory
      : item.category || 'fact';
  const key =
    typeof metadata.memoryKey === 'string'
      ? metadata.memoryKey
      : item.key || item.title || 'Memory';
  const value = item.value || item.content || item.summary || item.title || '';

  return {
    category,
    confidence: typeof item.score === 'number' ? item.score : 1,
    created_at: item.updatedAt,
    id: item.id,
    key,
    last_referenced_at: null,
    source: typeof metadata.source === 'string' ? metadata.source : null,
    updated_at: item.updatedAt,
    user_id: typeof metadata.userId === 'string' ? metadata.userId : '',
    value,
  };
}

async function fetchMiraMemories(wsId: string): Promise<MiraMemoriesResponse> {
  const response = await listWorkspaceAiMemoryItems(wsId, { product: 'mira' });
  const memories = response.items.map(mapAiMemoryItemToMiraMemory);
  const grouped = memories.reduce(
    (acc, memory) => {
      const category = memory.category;
      acc[category] ??= [];
      acc[category].push(memory);
      return acc;
    },
    {} as Record<string, MiraMemory[]>
  );

  return {
    grouped,
    memories,
    total: memories.length,
  };
}

async function deleteMiraMemory({
  memoryId,
  wsId,
}: {
  memoryId: string;
  wsId: string;
}): Promise<void> {
  await deleteWorkspaceAiMemoryItem(wsId, memoryId, {
    product: 'mira',
  });
}

export function useMiraMemories(wsId: string) {
  return useQuery({
    enabled: Boolean(wsId),
    queryKey: [...miraMemoriesKeys.list(), wsId],
    queryFn: () => fetchMiraMemories(wsId),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useDeleteMiraMemory(wsId: string) {
  const queryClient = useQueryClient();
  const listKey = [...miraMemoriesKeys.list(), wsId] as const;

  return useMutation({
    mutationFn: (memoryId: string) => deleteMiraMemory({ memoryId, wsId }),
    onMutate: async (memoryId) => {
      await queryClient.cancelQueries({
        queryKey: listKey,
      });

      const previous = queryClient.getQueryData<MiraMemoriesResponse>(listKey);

      // Optimistic removal
      queryClient.setQueryData<MiraMemoriesResponse>(listKey, (old) => {
        if (!old) return old;
        const filtered = old.memories.filter((m) => m.id !== memoryId);
        const grouped = filtered.reduce(
          (acc, m) => {
            const cat = m.category;
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(m);
            return acc;
          },
          {} as Record<string, MiraMemory[]>
        );
        return { memories: filtered, grouped, total: filtered.length };
      });

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}
