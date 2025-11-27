import { CheckCircle, Eye, Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import ExpandableTaskList from './expandable-task-list';

interface NewlyCreatedTasksProps {
  wsId: string;
}

export default async function NewlyCreatedTasks({
  wsId,
}: NewlyCreatedTasksProps) {
  const supabase = await createClient();
  const t = await getTranslations('dashboard');
  // Get recently created tasks (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: recentTasks, error } = await supabase
    .from('tasks')
    .select(
      `
      *,
      list:task_lists!inner(
        id,
        name,
        status,
        board:workspace_boards!inner(
          id,
          name,
          ws_id,
          estimation_type,
          extended_estimation,
          allow_zero_estimates
        )
      ),
      assignees:task_assignees(
        user:users(
          id,
          display_name,
          avatar_url
        )
      ),
      labels:task_labels(
        label:workspace_task_labels(
          id,
          name,
          color,
          created_at
        )
      )
    `
    )
    .eq('list.board.ws_id', wsId)
    .is('deleted_at', null)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching newly created tasks:', error);
    return null;
  }

  return (
    <Card className="group overflow-hidden border-dynamic-green/20 transition-all duration-300 hover:border-dynamic-green/30 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-green/20 border-b bg-linear-to-r from-dynamic-green/5 via-dynamic-green/3 to-dynamic-cyan/5 p-4">
        <CardTitle className="flex items-center gap-3 font-semibold text-base">
          <div className="rounded-xl bg-linear-to-br from-dynamic-green/20 to-dynamic-green/10 p-2 text-dynamic-green shadow-sm ring-1 ring-dynamic-green/20">
            <CheckCircle className="h-4 w-4" />
          </div>
          <div className="line-clamp-1">{t('recently_created_tasks')}</div>
        </CardTitle>
        <Link href={`/${wsId}/tasks/boards`}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 transition-all duration-200 hover:scale-105 hover:bg-dynamic-green/10 hover:text-dynamic-green"
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            {t('view_all')}
          </Button>
        </Link>
      </CardHeader>
      <CardContent className="h-full space-y-6 p-6">
        {recentTasks && recentTasks.length > 0 ? (
          <ExpandableTaskList tasks={recentTasks as any} isPersonal={false} />
        ) : (
          <div className="py-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-dynamic-gray/20 bg-linear-to-br from-dynamic-gray/10 via-dynamic-gray/5 to-dynamic-slate/10 shadow-sm ring-1 ring-dynamic-gray/10">
              <Plus className="h-10 w-10 text-dynamic-gray/60" />
            </div>
            <div className="space-y-3">
              <h3 className="font-bold text-dynamic-gray text-lg">
                {t('no_recently')}
              </h3>
              <p className="mx-auto max-w-sm text-dynamic-gray/70 text-sm leading-relaxed">
                {t('no_recently_created_tasks_description')}
              </p>
            </div>
            <div className="mt-8">
              <Link href={`/${wsId}/tasks/boards`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dynamic-green/30 bg-linear-to-r from-dynamic-green/5 to-dynamic-green/10 text-dynamic-green transition-all duration-200 hover:scale-105 hover:border-dynamic-green/40 hover:bg-dynamic-green/20 hover:shadow-md"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('create_task')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
