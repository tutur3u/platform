'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createMindBoard, listMindBoards } from '@tuturuuu/internal-api/mind';
import { BoardLibrary } from '@tuturuuu/mind-ui';
import {
  buildMindBoardHref,
  getSelectedMindBoardId,
} from '@tuturuuu/mind-ui/routes';
import { usePathname, useRouter } from 'next/navigation';

type Props = {
  mindPrefix?: string;
  workspaceSlug: string;
  wsId: string;
};

export function MindSidebarBoards({ mindPrefix, workspaceSlug, wsId }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const selectedBoardId = getSelectedMindBoardId(pathname);
  const boardsQuery = useQuery({
    queryFn: () => listMindBoards({ workspaceId: wsId }),
    queryKey: ['mind', 'boards', wsId],
  });
  const createBoardMutation = useMutation({
    mutationFn: (title: string) =>
      createMindBoard({ defaultHorizon: 'year', title }, { workspaceId: wsId }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['mind', 'boards', wsId] });
      router.push(
        buildMindBoardHref({
          boardId: response.board.id,
          mindPrefix,
          workspaceSlug,
        })
      );
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
        router.push(buildMindBoardHref({ boardId, mindPrefix, workspaceSlug }))
      }
      selectedBoardId={selectedBoardId}
    />
  );
}
