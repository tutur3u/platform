'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Library,
  LineChart,
  Zap,
} from '@tuturuuu/icons';
import { getTulearnHome } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { FeatureList } from './feature-list';
import { LearnerRequestError } from './learner-request-state';
import { LoadingState, useStudentHref, useStudentId } from './shared';

export function HomePage({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const studentId = useStudentId();
  const home = useQuery({
    queryFn: () => getTulearnHome(wsId, studentId),
    queryKey: ['tulearn', wsId, studentId, 'home'],
  });
  const snapshot = home.data;
  const current = snapshot?.courses.find(({ progress }) => progress < 100);
  const courseHref = useStudentHref(
    current ? `/${wsId}/courses/${current.id}` : `/${wsId}/courses`
  );
  const practiceHref = useStudentHref(`/${wsId}/practice`);
  const assignmentsHref = useStudentHref(`/${wsId}/assignments`);
  const reportsHref = useStudentHref(`/${wsId}/reports`);
  const libraryHref = useStudentHref(`/${wsId}/courses?view=library`);
  const aiHref = useStudentHref(`/${wsId}/ai-chat`);

  if (home.isPending) return <LoadingState />;
  if (!snapshot)
    return <LearnerRequestError retry={() => void home.refetch()} />;

  const shortcuts = [
    { href: practiceHref, Icon: Zap, label: t('practice.title') },
    {
      href: assignmentsHref,
      Icon: ClipboardCheck,
      label: t('assignments.title'),
    },
    {
      href: reportsHref,
      Icon: LineChart,
      label: t('learnerWorkspace.progress'),
    },
    { href: libraryHref, Icon: Library, label: t('learnerWorkspace.library') },
    { href: aiHref, Icon: BookOpen, label: t('navigation.aiChat') },
  ];
  const { state } = snapshot;
  const stats = [
    { label: t('home.hearts'), value: `${state.hearts}/${state.max_hearts}` },
    { label: t('home.xp'), value: state.xp_total },
    { label: t('home.streak'), value: state.current_streak },
  ];
  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">
            {snapshot.student.name ?? t('navigation.home')}
          </h1>
          {snapshot.readOnly && (
            <Badge variant="secondary">{t('settings.parentMode')}</Badge>
          )}
        </div>
        <dl className="flex flex-wrap gap-4">
          {stats.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-muted-foreground text-sm">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{current?.name ?? t('courses.title')}</CardTitle>
          {current?.description && (
            <p className="text-muted-foreground text-sm">
              {current.description}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {current && (
            <Progress
              aria-label={t('home.learningPath')}
              value={current.progress}
            />
          )}
          <Button asChild>
            <Link href={courseHref}>
              {current ? t('home.continueCourse') : t('courses.title')}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <nav
        className="flex flex-wrap gap-2"
        aria-label={t('learnerWorkspace.shortcuts')}
      >
        {shortcuts.map(({ href, Icon, label }) => (
          <Button asChild key={href} variant="outline">
            <Link href={href}>
              <Icon aria-hidden />
              {label}
            </Link>
          </Button>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-2">
        <FeatureList
          actionHref={assignmentsHref}
          actionLabel={t('assignments.title')}
          completedLabel={t('common.completed')}
          emptyLabel={t('assignments.empty')}
          items={snapshot.assignments.slice(0, 4)}
          title={t('home.assignments')}
          type="assignment"
        />
        <FeatureList
          emptyLabel={t('marks.empty')}
          items={snapshot.marks.slice(0, 4)}
          title={t('home.marks')}
          type="mark"
        />
      </div>
    </main>
  );
}
