'use client';

import {
  CalendarClock,
  CheckCircle2,
  Circle,
  ListTodo,
  Plus,
  User,
} from '@tuturuuu/icons';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export function TaskQuickActions({
  createTask,
  draftName,
  query,
  setQuery,
  workspaceSlug,
}: {
  createTask: () => void;
  draftName: string;
  query: string;
  setQuery: (query: string) => void;
  workspaceSlug: string;
}) {
  const t = useTranslations('command_palette');
  const router = useRouter();
  const actions = [
    { icon: User, key: 'mine', query: 'assignee:me is:open' },
    { icon: CalendarClock, key: 'overdue', query: 'due:overdue' },
    { icon: CalendarClock, key: 'soon', query: 'due:soon' },
    { icon: Circle, key: 'open', query: 'is:open' },
    { icon: CheckCircle2, key: 'completed', query: 'is:completed' },
  ] as const;
  const hasQuery = Boolean(query.trim());

  if (hasQuery && !draftName) return null;

  return (
    <CommandGroup heading={t('quick_actions')}>
      <CommandItem
        className="mx-1 my-0.5 min-h-12 gap-3 rounded-xl border border-transparent px-2.5 data-[selected=true]:border-border"
        onSelect={createTask}
        value={`action-create-task-${draftName}`}
      >
        <CommandIcon icon={<Plus className="size-4" />} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">
            {draftName
              ? t('task_command.create_named', { name: draftName })
              : t('task_command.create')}
          </p>
          <p className="truncate text-muted-foreground text-xs">
            {t('task_command.create_hint')}
          </p>
        </div>
      </CommandItem>
      {!hasQuery
        ? actions.map(({ icon: Icon, key, query: actionQuery }) => (
            <CommandItem
              className="mx-1 my-0.5 min-h-11 gap-3 rounded-xl px-2.5"
              key={key}
              onSelect={() => setQuery(actionQuery)}
              value={`action-task-filter-${key}`}
            >
              <CommandIcon icon={<Icon className="size-4" />} />
              <span className="flex-1 text-sm">
                {t(`task_command.actions.${key}`)}
              </span>
              <span className="text-muted-foreground text-xs">
                {actionQuery}
              </span>
            </CommandItem>
          ))
        : null}
      {!hasQuery ? (
        <CommandItem
          className="mx-1 my-0.5 min-h-11 gap-3 rounded-xl px-2.5"
          onSelect={() => router.push(`/${workspaceSlug}/tasks`)}
          value="action-open-task-boards"
        >
          <CommandIcon icon={<ListTodo className="size-4" />} />
          <span className="flex-1 text-sm">
            {t('task_command.actions.boards')}
          </span>
        </CommandItem>
      ) : null}
    </CommandGroup>
  );
}

export function CommandIcon({ icon }: { icon: ReactNode }) {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/50 text-muted-foreground">
      {icon}
    </div>
  );
}
