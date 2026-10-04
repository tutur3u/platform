'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarCheck,
  CheckCheck,
  ClipboardList,
} from '@tuturuuu/icons';
import {
  type EducationTodoItem,
  type EducationTodoKind,
  listEducationTodo,
} from '@tuturuuu/internal-api/teach';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import Link from 'next/link';
import { useState } from 'react';

const kinds = ['tutoring', 'assignments', 'lessons', 'tests'] as const;
const icons = {
  tutoring: CalendarCheck,
  assignments: ClipboardList,
  lessons: BookOpen,
  tests: ClipboardList,
};
function itemHref(
  app: 'learn' | 'teach',
  wsId: string,
  kind: EducationTodoKind,
  row: EducationTodoItem
) {
  if (kind === 'tutoring' || !row.courseId) return null;
  if (kind === 'tests')
    return `/${wsId}/courses/${row.courseId}${app === 'learn' ? `/tests/${row.id}` : ''}`;
  if (kind === 'assignments')
    return `/${wsId}/assignments${app === 'teach' ? `?course=${row.courseId}` : ''}`;
  return `/${wsId}/courses/${row.courseId}${app === 'teach' ? `/${row.id}` : ''}`;
}

export function EducationTodo({
  app,
  wsId,
  actorId,
  t,
}: {
  app: 'learn' | 'teach';
  wsId: string;
  actorId: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const [kind, setKind] = useState<EducationTodoKind>('tutoring');
  const [page, setPage] = useState(1);
  const [showCompleted, setShowCompleted] = useState(false);
  const query = useQuery({
    queryKey: ['education-todo', app, wsId, actorId, kind, page],
    queryFn: () => listEducationTodo(app, wsId, { kind, page }),
  });
  const rows = (query.data?.data ?? []).filter(
    (row) => showCompleted || !row.completed
  );
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-5 md:p-8">
      <header className="space-y-2">
        <h1 className="font-semibold text-3xl">{t('title')}</h1>
        <p className="max-w-2xl text-muted-foreground">
          {t(app === 'learn' ? 'learnDescription' : 'teachDescription')}
        </p>
      </header>
      <nav aria-label={t('categories')} className="flex flex-wrap gap-2">
        {kinds.map((value) => {
          const Icon = icons[value];
          return (
            <Button
              key={value}
              variant={kind === value ? 'default' : 'outline'}
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
                setPage(1);
              }}
            >
              <Icon className="size-4" />
              {t(value)}
            </Button>
          );
        })}
      </nav>
      {kind !== 'tutoring' && app === 'learn' ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showCompleted}
            onCheckedChange={(value) => setShowCompleted(value === true)}
          />
          {t('showCompleted')}
        </label>
      ) : null}
      {query.isError ? (
        <div role="alert" className="space-y-3 rounded-xl border p-5">
          <p>{t('error')}</p>
          <Button onClick={() => void query.refetch()} variant="outline">
            {t('retry')}
          </Button>
        </div>
      ) : query.isPending ? (
        <p role="status">{t('loading')}</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {t(app === 'learn' ? 'assignedCount' : 'pendingCount', {
              count: query.data?.count ?? 0,
            })}
          </p>
          <ul className="space-y-3">
            {rows.map((row) => {
              const href = itemHref(app, wsId, kind, row);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <h2 className="line-clamp-3 break-words font-medium">
                      {row.title ||
                        t(kind === 'tutoring' ? 'tutoring' : 'untitled')}
                    </h2>
                    {row.participantName ? (
                      <p className="text-muted-foreground text-sm">
                        {t(app === 'teach' ? 'student' : 'teacher')}:{' '}
                        {row.participantName}
                      </p>
                    ) : null}
                    {row.date ? (
                      <p className="text-muted-foreground text-sm">
                        {row.date}
                        {row.startTime ? ` · ${row.startTime.slice(0, 5)}` : ''}
                        {row.durationMinutes
                          ? ` · ${t('minutes', { count: row.durationMinutes })}`
                          : ''}
                      </p>
                    ) : null}
                    {row.completed ? (
                      <p className="flex items-center gap-1 text-muted-foreground text-sm">
                        <CheckCheck className="size-4" />
                        {t('completed')}
                      </p>
                    ) : null}
                  </div>
                  {href ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={href}>{t('open')}</Link>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {!rows.length ? (
            <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
              {t((query.data?.count ?? 0) ? 'emptyPage' : 'empty')}
            </p>
          ) : null}
          {(query.data?.totalPages ?? 0) > 1 ? (
            <nav
              aria-label={t('pages')}
              className="flex items-center justify-between gap-3"
            >
              <Button
                disabled={page === 1}
                onClick={() => setPage((value) => value - 1)}
                variant="outline"
              >
                {t('previous')}
              </Button>
              <span className="text-sm">
                {t('page', { page, total: query.data?.totalPages ?? 0 })}
              </span>
              <Button
                disabled={page >= (query.data?.totalPages ?? 0)}
                onClick={() => setPage((value) => value + 1)}
                variant="outline"
              >
                {t('next')}
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </main>
  );
}
