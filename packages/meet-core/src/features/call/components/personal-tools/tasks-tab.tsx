'use client';

import { CheckSquare } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { PersonalToolsSnapshot } from '../../lib/personal-tools';
import { PersonalAppLinkButton, resolveSafePersonalAppUrl } from './shared';

export function PersonalTasksTab({ data }: { data: PersonalToolsSnapshot }) {
  const t = useTranslations('meet.call.private_tools');
  const tasks = data.tasks
    ? [...data.tasks.overdue, ...data.tasks.today, ...data.tasks.upcoming]
    : null;
  const href = resolveSafePersonalAppUrl('tasks', data.workspace);

  return (
    <div>
      <PersonalAppLinkButton href={href} label={t('open_tasks')} />
      {data.tasksStatus === 'stale' && (
        <p role="status" className="mb-2 text-muted-foreground text-xs">
          {t('stale_tasks')}
        </p>
      )}
      {!tasks ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t('tab_unavailable')}
        </p>
      ) : !tasks.length ? (
        <p className="text-muted-foreground text-sm">{t('empty_tasks')}</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-start gap-2 rounded-lg px-2 py-2.5"
            >
              <CheckSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="break-words text-sm">{task.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
