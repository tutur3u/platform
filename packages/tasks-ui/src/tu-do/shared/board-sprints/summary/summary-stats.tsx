'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useTranslations } from 'next-intl';
import { statusIcons } from '../../../boards/boardId/status-section';
import { PlanTaskTitle } from '../plan/plan-parts';
import {
  groupTasksByList,
  type SprintSummaryNumbers,
} from './sprint-summary-model';

/** Tasks done out of all the sprint's tasks. */
export function SummaryDone({ numbers }: { numbers: SprintSummaryNumbers }) {
  const t = useTranslations('ws-task-boards.sprints');
  const { doneTasks, totalTasks } = numbers;
  const percent = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-medium text-sm">{t('tasks_done')}</h3>
        <span className="font-medium text-lg">
          {doneTasks} / {totalTasks}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-dynamic-green"
          style={{ width: `${percent}%` }}
        />
      </div>
    </section>
  );
}

/** The sprint's open tasks, counted per status. */
export function SummaryUnfinished({
  lists,
  tasks,
}: {
  lists: TaskList[];
  tasks: Task[];
}) {
  const t = useTranslations('ws-task-boards.sprints');

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="font-medium text-sm">
        {t('unfinished')}
        <span className="ml-2 text-muted-foreground">{tasks.length}</span>
      </h3>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('all_done')}</p>
      ) : null}
      {groupTasksByList(tasks, lists).map(({ list, tasks: inList }) => (
        <div className="flex flex-col gap-1" key={list?.id ?? 'other'}>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {statusIcons[list?.status ?? 'not_started']}
            </span>
            <span className="flex-1 font-medium">
              {list?.name ?? t('other_status')}
            </span>
            <span className="text-muted-foreground">{inList.length}</span>
          </div>
          {inList.map((task) => (
            <PlanTaskTitle
              className="pl-6 text-muted-foreground text-sm"
              key={task.id}
              task={task}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
