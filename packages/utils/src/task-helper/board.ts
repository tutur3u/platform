import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  createWorkspaceTaskBoard,
  getWorkspaceTaskBoard as getWorkspaceTaskBoardFromApi,
  listWorkspaceLabels,
  resolveTaskProjectWorkspaceId,
} from '@tuturuuu/internal-api/tasks';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, WorkspaceTaskBoard } from '@tuturuuu/types';

export async function getTaskBoard(
  _supabase: TypedSupabaseClient,
  boardId: string,
  workspaceId?: string,
  options?: InternalApiClientOptions
) {
  if (!workspaceId) {
    return null;
  }

  const payload = await getWorkspaceTaskBoardFromApi(
    workspaceId,
    boardId,
    options
  );

  return (payload.board ?? null) as WorkspaceTaskBoard | null;
}

export async function createBoardWithTemplate(
  wsId: string,
  name: string,
  templateId?: string,
  icon?: Database['public']['Enums']['platform_icon'] | null,
  options?: InternalApiClientOptions
) {
  const payload = await createWorkspaceTaskBoard(
    wsId,
    {
      name,
      template_id: templateId,
      icon: icon ?? null,
    },
    options
  );

  return payload.board as WorkspaceTaskBoard;
}

export function useCreateBoardWithTemplate(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      templateId,
      icon,
    }: {
      name: string;
      templateId?: string;
      icon?: Database['public']['Enums']['platform_icon'] | null;
    }) => {
      const baseUrl =
        typeof window !== 'undefined' ? window.location.origin : undefined;
      return createBoardWithTemplate(wsId, name, templateId, icon, {
        baseUrl: baseUrl ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-boards', wsId] });
    },
    onError: (error) => {
      console.error('Error creating board:', error);
    },
  });
}

export function useUpdateBoardWithTemplate(wsId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      boardId,
      name,
      icon,
    }: {
      boardId: string;
      name: string;
      icon: string | null;
    }) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/task-boards/${boardId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, icon }),
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message ?? 'Failed to update board');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards', wsId] });
    },
    onError: (error) => {
      console.error('Error updating board:', error);
    },
  });
}

export interface WorkspaceLabel {
  id: string;
  name: string;
  color: string;
  created_at: string;
  ws_id: string;
}

export function useWorkspaceLabels(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ['workspace-labels', wsId],
    queryFn: async () => {
      if (!wsId) return [];

      const labels = await listWorkspaceLabels(wsId);
      return labels as WorkspaceLabel[];
    },
    enabled: Boolean(wsId),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export interface BoardConfig {
  id: string;
  estimation_type: string | null;
  extended_estimation: boolean;
  allow_zero_estimates: boolean;
  ws_id: string;
  ticket_prefix: string | null;
}

export function useBoardConfig(boardId: string | null | undefined) {
  return useQuery({
    queryKey: ['board-config', boardId],
    queryFn: async () => {
      if (!boardId) return null;

      const workspaceId = await resolveTaskProjectWorkspaceId({ boardId });

      if (!workspaceId) {
        return null;
      }

      const payload = await getWorkspaceTaskBoardFromApi(workspaceId, boardId);
      const board = payload.board;

      return {
        id: board.id,
        estimation_type: board.estimation_type ?? null,
        extended_estimation: board.extended_estimation ?? false,
        allow_zero_estimates: board.allow_zero_estimates ?? false,
        ws_id: board.ws_id,
        ticket_prefix: board.ticket_prefix ?? null,
      } as BoardConfig;
    },
    enabled: Boolean(boardId),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
