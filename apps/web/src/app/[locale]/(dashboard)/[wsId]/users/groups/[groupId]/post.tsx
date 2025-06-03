import { useInViewport } from '@mantine/hooks';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Check, CircleHelp, Send, X } from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useState } from 'react';

export function PostEmailStatus({
  groupId,
  postId,
}: {
  groupId: string;
  postId: string;
}) {
  const supabase = createClient();

  const { ref, inViewport } = useInViewport();
  const [loading, setLoading] = useState(false);

  const [data, setData] = useState<{
    sent: number | null;
    checked: number | null;
    failed: number | null;
    tenative: number | null;
    count: number | null;
  }>();

  useEffect(() => {
    async function fetchData() {
      if (!inViewport || loading || data) return;
      setLoading(true);

      const { data: users, count } = await supabase
        .from('workspace_user_groups_users')
        .select(
          '...workspace_users(id, user_group_post_checks!inner(post_id, is_completed))',
          {
            count: 'exact',
          }
        )
        .eq('group_id', groupId)
        .eq('workspace_users.user_group_post_checks.post_id', postId);

      const { count: emailsCount } = await supabase
        .from('sent_emails')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('post_id', postId);

      if (users) {
        setData({
          sent: emailsCount,
          checked: users.filter((user) =>
            user?.user_group_post_checks?.find((check) => check?.is_completed)
          ).length,
          failed: users.filter((user) =>
            user?.user_group_post_checks?.find((check) => !check?.is_completed)
          ).length,
          tenative: users.filter((user) => !user.id).length,
          count,
        });
      }

      setLoading(false);
    }

    fetchData();
  }, [supabase, inViewport, postId]);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <div
        ref={ref}
        className={cn(
          'border-dynamic-purple/15 bg-dynamic-purple/15 text-dynamic-purple flex w-fit items-center gap-1 rounded border px-2 py-1 text-xs font-semibold'
        )}
      >
        {data?.sent ?? '-'}/{data?.count || 0} <Send className="h-4 w-4" />
      </div>
      <div
        ref={ref}
        className={cn(
          'border-dynamic-green/15 bg-dynamic-green/15 text-dynamic-green flex w-fit items-center gap-1 rounded border px-2 py-1 text-xs font-semibold'
        )}
      >
        {data?.checked ?? '-'} <Check className="h-4 w-4" />
      </div>
      <div
        ref={ref}
        className={cn(
          'border-dynamic-red/15 bg-dynamic-red/15 text-dynamic-red flex w-fit items-center gap-1 rounded border px-2 py-1 text-xs font-semibold'
        )}
      >
        {data?.failed ?? '-'} <X className="h-4 w-4" />
      </div>
      <div
        ref={ref}
        className={cn(
          'border-dynamic-blue/15 bg-dynamic-blue/15 text-dynamic-blue flex w-fit items-center gap-1 rounded border px-2 py-1 text-xs font-semibold'
        )}
      >
        {data?.tenative ?? '-'} <CircleHelp className="h-4 w-4" />
      </div>
    </div>
  );
}
