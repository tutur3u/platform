import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ListTodo,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { isPast, isToday } from 'date-fns';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

interface CompactTasksSummaryProps {
  wsId: string;
  userId: string;
}

export default async function CompactTasksSummary({
  wsId,
  userId,
}: CompactTasksSummaryProps) {
  const supabase = await createClient();
  const t = await getTranslations('dashboard');

  const { data: rpcTasks, error } = await supabase.rpc(
    'get_user_accessible_tasks',
    {
      p_user_id: userId,
      p_ws_id: wsId,
      p_include_deleted: false,
      p_list_statuses: ['not_started', 'active'],
      p_exclude_personally_completed: true,
      p_exclude_personally_unassigned: true,
    }
  );

  if (error) {
    console.error('Error fetching tasks summary:', error);
    return null;
  }

  let overdue = 0;
  let dueToday = 0;
  const total = rpcTasks?.length ?? 0;

  rpcTasks?.forEach((task) => {
    if (task.task_end_date) {
      const endDate = new Date(task.task_end_date);
      if (isPast(endDate) && !isToday(endDate)) overdue++;
      else if (isToday(endDate)) dueToday++;
    }
  });

  return (
    <Card className="min-w-0 border-0 bg-transparent shadow-none">
      <CardHeader className="px-2 pt-2 pb-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-1.5 truncate font-semibold text-xs">
            <ListTodo className="h-4 w-4 shrink-0 text-dynamic-orange" />
            <span className="truncate">{t('compact_tasks_title')}</span>
          </CardTitle>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-5 shrink-0 px-1.5 text-[11px]"
          >
            <Link href={`/${wsId}/tasks`}>
              {t('view_all')}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        {total === 0 ? (
          <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-dynamic-green" />
            <span className="truncate">{t('compact_tasks_empty')}</span>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 font-bold text-xl">{total}</div>
            <div className="flex min-w-0 flex-col gap-0.5 text-xs">
              {overdue > 0 && (
                <span
                  className={cn(
                    'flex items-center gap-1 font-medium text-dynamic-red'
                  )}
                >
                  <AlertCircle className="h-3 w-3" />
                  {t('compact_tasks_overdue', { count: overdue })}
                </span>
              )}
              {dueToday > 0 && (
                <span className="flex items-center gap-1 text-dynamic-orange">
                  {t('compact_tasks_today', { count: dueToday })}
                </span>
              )}
              {overdue === 0 && dueToday === 0 && (
                <span className="text-muted-foreground">
                  {t('compact_tasks_upcoming')}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
