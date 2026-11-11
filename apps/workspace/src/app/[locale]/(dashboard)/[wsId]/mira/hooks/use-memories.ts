'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AiMemoryItem,
  createMiraMemory,
  deleteWorkspaceAiMemoryItem,
  listWorkspaceAiMemoryItems,
} from '@tuturuuu/internal-api/ai-memory';
import type { MiraMemory, MiraMemoryCategory } from '../types/mira';
import { miraKeys } from './use-mira';

interface MemoriesResponse {
  memories: MiraMemory[];
  grouped: Record<string, MiraMemory[]>;
  total: number;
}

interface CreateMemoryData {
  category: MiraMemoryCategory;
  key: string;
  value: string;
  source?: string;
  confidence?: number;
}

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
    category: category as MiraMemoryCategory,
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

function groupMemories(memories: MiraMemory[]) {
  return memories.reduce(
    (acc, memory) => {
      const category = memory.category;
      acc[category] ??= [];
      acc[category].push(memory);
      return acc;
    },
    {} as Record<string, MiraMemory[]>
  );
}

// Fetch memories
async function fetchMemories(
  wsId: string,
  category?: string
): Promise<MemoriesResponse> {
  const response = await listWorkspaceAiMemoryItems(wsId, {
    category,
    product: 'mira',
  });
  const memories = response.items.map(mapAiMemoryItemToMiraMemory);
  return {
    grouped: groupMemories(memories),
    memories,
    total: memories.length,
  };
}

// Create/update memory
async function createMemory(
  wsId: string,
  data: CreateMemoryData
): Promise<{ memory: MiraMemory }> {
  return createMiraMemory<MiraMemory>(wsId, data);
}

// Delete memory
async function deleteMemory({
  memoryId,
  wsId,
}: {
  memoryId: string;
  wsId: string;
}): Promise<{ success: boolean }> {
  await deleteWorkspaceAiMemoryItem(wsId, memoryId, { product: 'mira' });
  return { success: true };
}

/**
 * Hook for fetching memories
 */
export function useMemories(wsId: string, category?: MiraMemoryCategory) {
  return useQuery({
    enabled: Boolean(wsId),
    queryKey: [...miraKeys.memories(category), wsId],
    queryFn: () => fetchMemories(wsId, category),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook for creating/updating a memory
 */
export function useCreateMemory(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateMemoryData) => createMemory(wsId, data),
    onSuccess: (data, variables) => {
      // Optimistically update cache
      queryClient.setQueryData(
        [...miraKeys.memories(variables.category), wsId],
        (old: MemoriesResponse | undefined) => {
          if (!old) return old;

          const existingIndex = old.memories.findIndex(
            (m) => m.category === variables.category && m.key === variables.key
          );

          if (existingIndex >= 0) {
            // Update existing
            const newMemories = [...old.memories];
            newMemories[existingIndex] = data.memory;
            return {
              ...old,
              memories: newMemories,
            };
          }
          // Add new
          return {
            ...old,
            memories: [data.memory, ...old.memories],
            total: old.total + 1,
          };
        }
      );

      // Also invalidate the "all" memories query
      queryClient.invalidateQueries({
        queryKey: [...miraKeys.memories(), wsId],
      });
    },
  });
}

/**
 * Hook for deleting a memory
 */
export function useDeleteMemory(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memoryId: string) => deleteMemory({ memoryId, wsId }),
    onSuccess: (_, memoryId) => {
      // Update all memory queries
      queryClient.setQueriesData(
        { queryKey: [...miraKeys.all, 'memories'] },
        (old: MemoriesResponse | undefined) => {
          if (!old) return old;
          return {
            ...old,
            memories: old.memories.filter((m) => m.id !== memoryId),
            total: Math.max(0, old.total - 1),
          };
        }
      );
    },
  });
}

/**
 * Get memories by category
 */
export function useMemoriesByCategory(wsId: string) {
  const { data, ...rest } = useMemories(wsId);

  return {
    ...rest,
    data: data?.grouped ?? {},
    total: data?.total ?? 0,
  };
}
