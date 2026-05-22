'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createMindBoard, listMindBoards } from '@tuturuuu/internal-api/mind';
import { useRouter } from 'next/navigation';
import { buildMindBoardHref } from '../../routes';

type UseMindBoardLibraryOptions = {
  mindPrefix?: string;
  workspaceSlug: string;
  wsId: string;
};

export function useMindBoardLibrary({
  mindPrefix,
  workspaceSlug,
  wsId,
}: UseMindBoardLibraryOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const boardsQuery = useQuery({
    queryFn: () => listMindBoards({ workspaceId: wsId }),
    queryKey: ['mind', 'boards', wsId],
  });

  const navigateToBoard = (boardId: string) => {
    router.push(buildMindBoardHref({ boardId, mindPrefix, workspaceSlug }));
  };

  const createBoardMutation = useMutation({
    mutationFn: (title: string) =>
      createMindBoard({ defaultHorizon: 'year', title }, { workspaceId: wsId }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['mind', 'boards', wsId] });
      navigateToBoard(response.board.id);
    },
  });

  return {
    boards: boardsQuery.data?.boards ?? [],
    creating: createBoardMutation.isPending,
    error: boardsQuery.isError,
    loading: boardsQuery.isLoading,
    onCreateBoard: (title: string) => createBoardMutation.mutate(title),
    onRetry: () => void boardsQuery.refetch(),
    onSelectBoard: navigateToBoard,
  };
}
