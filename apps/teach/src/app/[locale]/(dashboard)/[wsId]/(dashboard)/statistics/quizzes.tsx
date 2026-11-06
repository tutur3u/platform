import { createClient } from '@tuturuuu/supabase/next/server';
import { getTranslations } from 'next-intl/server';
import StatisticCard from '@/components/cards/StatisticCard';
import { requireTeachWorkspaceMember } from '@/lib/require-teach-workspace-member';

export default async function QuizzesStatistics({
  wsId,
  className,
  permissions: resolvedPermissions,
}: {
  wsId: string;
  className?: string;
  permissions?: Awaited<ReturnType<typeof requireTeachWorkspaceMember>>;
  redirect?: boolean;
}) {
  const permissions =
    resolvedPermissions ?? (await requireTeachWorkspaceMember(wsId));
  if (permissions.withoutPermission('update_user_groups')) return null;
  const resolvedWsId = permissions.wsId;
  const supabase = await createClient();
  const t = await getTranslations();

  const enabled = true;

  const { count } = enabled
    ? await supabase
        .from('workspace_quizzes')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('ws_id', resolvedWsId)
    : { count: 0 };

  if (!enabled) return null;

  return (
    <StatisticCard
      title={t('workspace-education-tabs.quizzes')}
      value={count}
      href={`/${wsId}/education/quizzes`}
      className={className}
    />
  );
}
