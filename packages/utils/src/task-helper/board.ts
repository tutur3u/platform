import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InternalApiClientOptions } from '@tuturuuu/internal-api/client';
import {
  createWorkspaceTaskBoard,
  getWorkspaceTaskBoard as getWorkspaceTaskBoardFromApi,
  listWorkspaceLabels,
  updateWorkspaceTaskBoard,
  updateWorkspaceTaskList,
} from '@tuturuuu/internal-api/tasks';
import type { Database, WorkspaceTaskBoard } from '@tuturuuu/types';
import { getMutationApiOptions } from './shared';

export async function getTaskBoard(
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

export async function deleteTaskList(
  wsId: string,
  boardId: string,
  listId: string
) {
  const options = await getMutationApiOptions();
  const { list } = await updateWorkspaceTaskList(
    wsId,
    boardId,
    listId,
    { deleted: true },
    options
  );

  return list;
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
      queryClient.invalidateQueries({ queryKey: ['boards', wsId] });
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
      return updateWorkspaceTaskBoard(
        wsId,
        boardId,
        {
          name,
          icon: icon as Database['public']['Enums']['platform_icon'] | null,
        },
        {
          baseUrl:
            typeof window !== 'undefined' ? window.location.origin : undefined,
        }
      );
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

export function useBoardConfig(
  boardId: string | null | undefined,
  wsId: string | null | undefined
) {
  return useQuery({
    queryKey: ['board-config', wsId, boardId],
    queryFn: async () => {
      if (!boardId || !wsId) {
        return null;
      }

      const payload = await getWorkspaceTaskBoardFromApi(wsId, boardId);
      const board = payload.board;
      if (!board) {
        return null;
      }

      return {
        id: board.id,
        estimation_type: board.estimation_type ?? null,
        extended_estimation: board.extended_estimation ?? false,
        allow_zero_estimates: board.allow_zero_estimates ?? false,
        ws_id: board.ws_id,
        ticket_prefix: board.ticket_prefix ?? null,
      } as BoardConfig;
    },
    enabled: Boolean(boardId && wsId),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
