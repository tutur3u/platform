'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createMindBoard, listMindBoards } from '@tuturuuu/internal-api/mind';
import { usePathname, useRouter } from 'next/navigation';
import { BoardLibrary } from '@/components/mind/board-library';

type Props = {
  workspaceSlug: string;
  wsId: string;
};

function getSelectedBoardId(pathname: string) {
  const match = pathname.match(/\/boards\/([^/]+)/);
  return match?.[1] ?? null;
}

export function MindSidebarBoards({ workspaceSlug, wsId }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const selectedBoardId = getSelectedBoardId(pathname);
  const boardsQuery = useQuery({
    queryFn: () => listMindBoards({ workspaceId: wsId }),
    queryKey: ['mind', 'boards', wsId],
  });
  const createBoardMutation = useMutation({
    mutationFn: (title: string) =>
      createMindBoard({ defaultHorizon: 'year', title }, { workspaceId: wsId }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['mind', 'boards', wsId] });
      router.push(`/${workspaceSlug}/boards/${response.board.id}`);
    },
  });

  return (
    <BoardLibrary
      boards={boardsQuery.data?.boards ?? []}
      creating={createBoardMutation.isPending}
      error={boardsQuery.isError}
      loading={boardsQuery.isLoading}
      onCreateBoard={(title) => createBoardMutation.mutate(title)}
      onRetry={() => void boardsQuery.refetch()}
      onSelectBoard={(boardId) =>
        router.push(`/${workspaceSlug}/boards/${boardId}`)
      }
      selectedBoardId={selectedBoardId}
    />
  );
}
