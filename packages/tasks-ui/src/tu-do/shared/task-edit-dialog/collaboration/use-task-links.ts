import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import {
  createTaskLink,
  deleteTaskLink,
  getTaskExternalRef,
  listTaskLinks,
} from './api';
import {
  taskExternalRefKey,
  taskLinksKey,
  taskTimelineKey,
} from './query-keys';

function refresh(queryClient: QueryClient, wsId: string, taskId?: string) {
  void queryClient.invalidateQueries({ queryKey: taskLinksKey(wsId, taskId) });
  void queryClient.invalidateQueries({
    queryKey: taskTimelineKey(wsId, taskId),
  });
}

export function useTaskLinks(wsId: string, taskId?: string) {
  return useQuery({
    queryKey: taskLinksKey(wsId, taskId),
    queryFn: async () => (await listTaskLinks(wsId, taskId!)).links,
    enabled: !!wsId && !!taskId,
    staleTime: 15 * 1000,
  });
}

export function useTaskLinkMutations(
  wsId: string,
  taskId: string | undefined,
  failureMessage: string
) {
  const queryClient = useQueryClient();
  const options = {
    onSuccess: () => refresh(queryClient, wsId, taskId),
    onError: () => toast.error(failureMessage),
  };

  const add = useMutation({
    mutationFn: (url: string) => createTaskLink(wsId, taskId!, url),
    ...options,
  });
  const remove = useMutation({
    mutationFn: (linkId: string) => deleteTaskLink(wsId, taskId!, linkId),
    ...options,
  });

  return { add, remove };
}

export function useTaskExternalRef(wsId: string, taskId?: string) {
  return useQuery({
    queryKey: taskExternalRefKey(wsId, taskId),
    queryFn: async () => (await getTaskExternalRef(wsId, taskId!)).ref,
    enabled: !!wsId && !!taskId,
    staleTime: 5 * 60 * 1000,
  });
}
