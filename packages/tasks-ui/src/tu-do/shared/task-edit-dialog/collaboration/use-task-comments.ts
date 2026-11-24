import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import {
  createTaskComment,
  deleteTaskComment,
  listTaskComments,
  updateTaskComment,
} from './api';
import { taskCommentsKey, taskTimelineKey } from './query-keys';

const COMMENT_PAGE_LIMIT = 100;

function refresh(queryClient: QueryClient, wsId: string, taskId?: string) {
  void queryClient.invalidateQueries({
    queryKey: taskCommentsKey(wsId, taskId),
  });
  void queryClient.invalidateQueries({
    queryKey: taskTimelineKey(wsId, taskId),
  });
}

export function useTaskComments(wsId: string, taskId?: string) {
  return useQuery({
    queryKey: taskCommentsKey(wsId, taskId),
    queryFn: async () => {
      const { comments } = await listTaskComments(wsId, taskId!, {
        limit: COMMENT_PAGE_LIMIT,
      });
      return comments;
    },
    enabled: !!wsId && !!taskId,
    staleTime: 15 * 1000,
  });
}

interface MutationOptions {
  wsId: string;
  taskId?: string;
  failureMessage: string;
}

export function useTaskCommentMutations({
  wsId,
  taskId,
  failureMessage,
}: MutationOptions) {
  const queryClient = useQueryClient();
  const options = {
    onSuccess: () => refresh(queryClient, wsId, taskId),
    onError: () => toast.error(failureMessage),
  };

  const create = useMutation({
    mutationFn: (body: string) => createTaskComment(wsId, taskId!, body),
    ...options,
  });
  const update = useMutation({
    mutationFn: (input: { id: string; body: string }) =>
      updateTaskComment(wsId, taskId!, input.id, input.body),
    ...options,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteTaskComment(wsId, taskId!, id),
    ...options,
  });

  return { create, update, remove };
}
