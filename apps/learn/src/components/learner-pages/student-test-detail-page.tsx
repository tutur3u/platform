'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BookOpenCheck,
  Calendar,
  ChevronLeft,
  Clock,
  GraduationCap,
  Layers,
  Play,
} from '@tuturuuu/icons';
import { getTulearnCourse } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  EmptyState,
  LoadingState,
  useStudentHref,
  useStudentId,
} from './shared';

interface StudentTestDetailPageProps {
  wsId: string;
  courseId: string;
  testId: string;
}

export function StudentTestDetailPage({
  wsId,
  courseId,
  testId,
}: StudentTestDetailPageProps) {
  const t = useTranslations();
  const studentId = useStudentId();
  const courseHref = useStudentHref(`/${wsId}/courses/${courseId}`);

  // Fetch course details which includes tests
  const courseQuery = useQuery({
    queryKey: ['tulearn', wsId, studentId, 'course', courseId],
    queryFn: () => getTulearnCourse(wsId, courseId, studentId),
  });

  if (courseQuery.isLoading) return <LoadingState />;
  if (courseQuery.isError || !courseQuery.data) {
    return (
      <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
        <EmptyState
          action={
            <button
              className="border-2 border-border bg-background px-4 py-2 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
              onClick={() => courseQuery.refetch()}
              type="button"
            >
              {t('common.retry')}
            </button>
          }
          label={t('courses.loadError')}
        />
      </main>
    );
  }

  const test = courseQuery.data.tests?.find((t) => t.id === testId);
  const testModules = (courseQuery.data.modules ?? []).filter((m) =>
    test?.module_ids?.includes(m.id)
  );

  if (!test) {
    return (
      <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
        <div className="mx-auto max-w-4xl border-2 border-border border-dashed bg-background p-8 text-center shadow-[8px_8px_0_var(--border)]">
          <h2 className="font-bold text-xl">{t('courses.testNotFound')}</h2>
          <p className="mt-2 text-muted-foreground">
            {t('courses.testNotFoundDescription')}
          </p>
          <Link
            href={courseHref}
            className="mt-4 inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('courses.backToCourse')}
          </Link>
        </div>
      </main>
    );
  }

  const handleStartTest = () => {
    toast.success('Starting test session...');
  };

  return (
    <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Back navigation link */}
        <div>
          <Link
            className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
            href={courseHref}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('courses.backToCourse')}
          </Link>
        </div>

        {/* Page Header */}
        <div className="border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)] md:p-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15 shadow-[4px_4px_0_var(--border)]">
                <BookOpenCheck className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-2 inline-flex items-center gap-1.5 border-2 border-border bg-dynamic-yellow/15 px-3 py-1 font-black text-xs shadow-[3px_3px_0_var(--border)]">
                  <GraduationCap className="h-3.5 w-3.5" />
                  {courseQuery.data.name ?? t('courses.untitled')}
                </p>
                <h1 className="break-words font-black text-[clamp(1.75rem,3.5vw,3rem)] leading-none tracking-normal">
                  {test.name}
                </h1>
              </div>
            </div>

            <div className="flex shrink-0 items-center self-start md:self-center">
              <button
                onClick={handleStartTest}
                className="inline-flex cursor-pointer items-center justify-center gap-2 border-2 border-border bg-primary px-5 py-3 font-bold text-base text-primary-foreground shadow-[4px_4px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--border)] active:translate-y-0 active:shadow-[2px_2px_0_var(--border)]"
                type="button"
              >
                <Play className="h-5 w-5" />
                {t('courses.startTest')}
              </button>
            </div>
          </div>
        </div>

        {/* Metadata Details Row */}
        <div className="grid grid-cols-1 gap-4 border-2 border-border bg-background p-5 shadow-[6px_6px_0_var(--border)] md:grid-cols-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-muted/40">
              <Calendar className="h-5 w-5" />
            </span>
            <div>
              <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('courses.testDetailsStartAt')}
              </span>
              <span className="font-bold text-sm">
                {test.start_at
                  ? new Date(test.start_at).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : t('courses.notScheduled')}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-muted/40">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('courses.testDetailsDuration')}
              </span>
              <span className="font-bold text-sm">
                {test.duration_in_minutes
                  ? t('courses.durationMinutes', {
                      minutes: test.duration_in_minutes,
                    })
                  : t('courses.untimed')}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-muted/40">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('courses.submittingType')}
              </span>
              <span className="font-bold text-sm">
                {t('courses.onlineTest')}
              </span>
            </div>
          </div>
        </div>

        {/* Description / Instructions */}
        <div className="space-y-4 border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)]">
          <h2 className="border-border border-b-2 pb-2 font-black text-lg uppercase tracking-wider">
            {t('courses.assessmentOverview')}
          </h2>
          <div className="whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed">
            {test.description || t('courses.noInstructions')}
          </div>
        </div>

        {/* Learning Objectives Assessed */}
        <div className="space-y-4 border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)]">
          <h2 className="border-border border-b-2 pb-2 font-black text-lg uppercase tracking-wider">
            {t('courses.learningObjectivesAssessed')}
          </h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t('courses.learningObjectivesDescription')}
          </p>
          {testModules.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              {t('courses.noAssociatedModules')}
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
              {testModules.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 border-2 border-border bg-muted/10 p-3 shadow-[2px_2px_0_var(--border)]"
                >
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span className="font-bold text-sm">{m.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
