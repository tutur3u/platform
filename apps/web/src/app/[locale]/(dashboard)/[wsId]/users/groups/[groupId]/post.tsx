import { useInViewport } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleHelp, Send, SkipForward, X } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

interface PostStatusData {
  sent: number | null;
  checked: number | null;
  failed: number | null;
  tentative: number | null;
  count: number | null;
  queue: {
    queued: number;
    processing: number;
    sent: number;
    failed: number;
    blocked: number;
    cancelled: number;
    skipped: number;
  };
}

export function PostEmailStatus({
  wsId,
  groupId,
  postId,
}: {
  wsId: string;
  groupId: string;
  postId: string;
}) {
  const { ref, inViewport } = useInViewport();

  const { data } = useQuery<PostStatusData>({
    queryKey: ['user-group-post-email-status', groupId, postId],
    enabled: Boolean(inViewport && wsId && groupId && postId),
    queryFn: async (): Promise<PostStatusData> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/user-groups/${groupId}/posts/${postId}/status`,
        { cache: 'no-store' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch post status');
      }

      return await response.json();
    },
    staleTime: 30_000,
  });

  return (
    <div ref={ref} className="flex flex-wrap items-center gap-1">
      <div
        className={cn(
          'flex w-fit items-center gap-1 rounded border border-dynamic-purple/15 bg-dynamic-purple/15 px-2 py-1 font-semibold text-dynamic-purple text-xs'
        )}
      >
        {data?.sent ?? '-'}/{data?.count || 0} <Send className="h-4 w-4" />
      </div>
      <div
        className={cn(
          'flex w-fit items-center gap-1 rounded border border-dynamic-green/15 bg-dynamic-green/15 px-2 py-1 font-semibold text-dynamic-green text-xs'
        )}
      >
        {data?.checked ?? '-'} <Check className="h-4 w-4" />
      </div>
      <div
        className={cn(
          'flex w-fit items-center gap-1 rounded border border-dynamic-red/15 bg-dynamic-red/15 px-2 py-1 font-semibold text-dynamic-red text-xs'
        )}
      >
        {data?.failed ?? '-'} <X className="h-4 w-4" />
      </div>
      <div
        className={cn(
          'flex w-fit items-center gap-1 rounded border border-dynamic-blue/15 bg-dynamic-blue/15 px-2 py-1 font-semibold text-dynamic-blue text-xs'
        )}
      >
        {data?.tentative ?? '-'} <CircleHelp className="h-4 w-4" />
      </div>
      <div
        className={cn(
          'flex w-fit items-center gap-1 rounded border border-dynamic-purple/15 bg-dynamic-purple/15 px-2 py-1 font-semibold text-dynamic-purple text-xs'
        )}
      >
        {data?.queue?.skipped ?? '-'} <SkipForward className="h-4 w-4" />
      </div>
    </div>
  );
}
