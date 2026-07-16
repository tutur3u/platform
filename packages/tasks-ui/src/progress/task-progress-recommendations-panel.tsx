import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CircleDot, FileText, ListChecks } from '@tuturuuu/icons';
import {
  getTaskProgressRecommendations,
  type TaskProgressNextTask,
} from '@tuturuuu/tasks-api';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { Translate } from './task-progress-shared';

const PRIORITY_DOT: Record<number, string> = {
  1: 'text-dynamic-red',
  2: 'text-dynamic-orange',
  3: 'text-dynamic-yellow',
  4: 'text-dynamic-blue',
};

function formatDue(date: string | null) {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function TaskRow({ task, t }: { task: TaskProgressNextTask; t: Translate }) {
  const due = formatDue(task.end_date);
  const dotClass =
    (task.priority != null && PRIORITY_DOT[task.priority]) ||
    'text-muted-foreground/40';
  return (
    <div className="flex items-center gap-2.5 rounded-lg border px-3 py-2">
      <CircleDot className={cn('size-3.5 shrink-0', dotClass)} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">{task.name}</div>
        {task.board_name || task.list_name ? (
          <div className="truncate text-muted-foreground text-xs">
            {[task.board_name, task.list_name].filter(Boolean).join(' · ')}
          </div>
        ) : null}
      </div>
      <span className="shrink-0 text-muted-foreground text-xs">
        {due
          ? t('recommendations.due', { date: due })
          : t('recommendations.no_due')}
      </span>
    </div>
  );
}

export function RecommendationsPanel({
  routeWsId,
  t,
  wsId,
}: {
  routeWsId: string;
  t: Translate;
  wsId: string;
}) {
  const query = useQuery({
    queryKey: ['task-progress', wsId, 'recommendations'],
    queryFn: () => getTaskProgressRecommendations(wsId),
  });

  const data = query.data?.ok ? query.data : null;
  if (!data) return null;
  const { nextTasks, documents } = data;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <ListChecks className="size-4 text-dynamic-green" />
              {t('recommendations.next_tasks')}
            </span>
            <Link
              className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
              href={`/${routeWsId}/tasks`}
            >
              {t('recommendations.view_all_tasks')}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-4">
          {nextTasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('recommendations.no_tasks')}
            </p>
          ) : (
            nextTasks.map((task) => <TaskRow key={task.id} task={task} t={t} />)
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-4 text-dynamic-purple" />
            {t('recommendations.documents')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-4">
          {documents.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t('recommendations.no_documents')}
            </p>
          ) : (
            documents.map((doc) => (
              <div
                className="flex items-center gap-2.5 rounded-lg border px-3 py-2"
                key={doc.id}
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium text-sm">
                  {doc.name}
                </span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {formatDue(doc.created_at) ?? ''}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
