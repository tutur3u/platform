import { MessageSquarePlus, ShieldAlert, Users } from '@tuturuuu/icons';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { cn } from '@tuturuuu/utils/format';
import { getTranslations } from 'next-intl/server';
import { fetchRequireAttentionUserIds } from '@/lib/require-attention-users';
import { UsersDatabaseStatTile } from './users-database-stat-tile';

interface UsersDatabaseHeroStatsProps {
  wsId: string;
  canViewFeedbacks: boolean;
}

/**
 * Async, streamable metrics row for the Users Database hero. Each metric is
 * fetched in parallel and the component is rendered inside a Suspense boundary
 * so it never blocks the page shell from painting.
 */
export async function UsersDatabaseHeroStats({
  wsId,
  canViewFeedbacks,
}: UsersDatabaseHeroStatsProps) {
  const t = await getTranslations('ws-users');
  const tFeedback = await getTranslations('ws-user-feedbacks');
  const sbAdmin = await createAdminClient();

  const [totalUsersResult, feedbackCountResult, attentionUserIds] =
    await Promise.all([
      sbAdmin
        .from('workspace_users')
        .select('id', { count: 'exact', head: true })
        .eq('ws_id', wsId),
      canViewFeedbacks
        ? sbAdmin
            .from('user_feedbacks')
            .select(
              'id, user:workspace_users!user_feedbacks_user_id_fkey!inner(ws_id)',
              { count: 'exact', head: true }
            )
            .eq('user.ws_id', wsId)
        : Promise.resolve({ count: 0, error: null }),
      canViewFeedbacks
        ? fetchRequireAttentionUserIds(sbAdmin, { wsId })
        : Promise.resolve(new Set<string>()),
    ]);

  const totalUsers = totalUsersResult.count ?? 0;
  const feedbackCount = feedbackCountResult.count ?? 0;
  const attentionCount = attentionUserIds.size;

  return (
    <div
      className={cn(
        'grid gap-3',
        canViewFeedbacks ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:max-w-xs'
      )}
    >
      <UsersDatabaseStatTile
        label={t('total_users')}
        value={totalUsers.toLocaleString()}
        description={t('total_users_description')}
        icon={<Users className="h-5 w-5 text-dynamic-blue" />}
        iconWrapperClassName="bg-dynamic-blue/10"
      />
      {canViewFeedbacks ? (
        <>
          <UsersDatabaseStatTile
            label={tFeedback('requires_attention')}
            value={attentionCount.toLocaleString()}
            description={t('feedback_queue_description', {
              count: attentionCount,
            })}
            icon={<ShieldAlert className="h-5 w-5 text-dynamic-orange" />}
            iconWrapperClassName="bg-dynamic-orange/10"
            accentClassName={
              attentionCount > 0 ? 'text-dynamic-orange' : undefined
            }
            href={`/${wsId}/users/database?requireAttention=true`}
            actionLabel={t('feedback_queue_review')}
          />
          <UsersDatabaseStatTile
            label={tFeedback('title')}
            value={feedbackCount.toLocaleString()}
            description={t('feedback_records_description', {
              count: feedbackCount,
            })}
            icon={<MessageSquarePlus className="h-5 w-5 text-dynamic-purple" />}
            iconWrapperClassName="bg-dynamic-purple/10"
            href={`/${wsId}/users/feedbacks`}
            actionLabel={t('feedback_center_open')}
          />
        </>
      ) : null}
    </div>
  );
}

/** Skeleton shown while {@link UsersDatabaseHeroStats} streams in. */
export function UsersDatabaseHeroStatsSkeleton({
  canViewFeedbacks,
}: {
  canViewFeedbacks: boolean;
}) {
  const count = canViewFeedbacks ? 3 : 1;

  return (
    <div
      className={cn(
        'grid gap-3',
        canViewFeedbacks ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:max-w-xs'
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`stat-${i}`}
          className="h-[116px] animate-pulse rounded-2xl border border-border/60 bg-foreground/5"
        />
      ))}
    </div>
  );
}
