import { useInViewport } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleHelp, Send, X } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { cn } from '@tuturuuu/utils/format';

type UserGroupPostCheckRow = {
    is_completed: boolean | null;
};

type UserRow = {
    id: string | null;
    user_group_post_checks?: UserGroupPostCheckRow[] | null;
};

export function PostEmailStatus({
  groupId,
  postId,
}: {
  groupId: string;
  postId: string;
}) {
  const { ref, inViewport } = useInViewport();



  const { data } = useQuery({
    queryKey: ['user-group-post-email-status', groupId, postId],
    enabled: Boolean(inViewport && groupId && postId),
    queryFn: async (): Promise<{
      sent: number | null;
      checked: number | null;
      failed: number | null;
      tentative: number | null;
      count: number | null;
    }> => {
      const supabase = createClient();

      const {
        data: users,
        count,
        error: usersError,
      } = await supabase
        .from('workspace_user_groups_users')
        .select(
          '...workspace_users(id, user_group_post_checks!inner(post_id, is_completed))',
          {
            count: 'exact',
          }
        )
        .eq('group_id', groupId)
        .eq('workspace_users.user_group_post_checks.post_id', postId);

      if (usersError) throw usersError;

      const { count: emailsCount, error: emailsError } = await supabase
        .from('sent_emails')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('post_id', postId);

      if (emailsError) throw emailsError;

      const safeUsers = (users ?? []) as UserRow[];

      return {
        sent: emailsCount,
        checked: safeUsers.filter((user) =>
          user?.user_group_post_checks?.find((check) => check?.is_completed)
        ).length,
        failed: safeUsers.filter((user) =>
          user?.user_group_post_checks?.find((check) => !check?.is_completed)
        ).length,
        tentative: safeUsers.filter((user) => !user?.id).length,
        count,
      };
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
    </div>
  );
}
