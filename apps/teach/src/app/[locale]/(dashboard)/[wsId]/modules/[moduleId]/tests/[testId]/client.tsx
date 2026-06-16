'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpenCheck,
  Calendar,
  Clock,
  GraduationCap,
  Layers,
  Play,
} from '@tuturuuu/icons';
import {
  listWorkspaceCourseModules,
  listWorkspaceCourseTests,
} from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

interface TestDetailClientProps {
  courseId: string;
  wsId: string;
  testId: string;
  workspaceName: string | null;
}

export function TestDetailClient({
  courseId,
  wsId,
  testId,
  workspaceName,
}: TestDetailClientProps) {
  const t = useTranslations();

  // Query tests
  const { data: testsData, isLoading: isLoadingTests } = useQuery({
    queryKey: ['course-tests', wsId, courseId],
    queryFn: () => listWorkspaceCourseTests(wsId, courseId),
  });

  // Query course modules
  const { data: modulesData, isLoading: isLoadingModules } = useQuery({
    queryKey: ['course-modules', wsId, courseId],
    queryFn: () => listWorkspaceCourseModules(wsId, courseId),
  });

  const test = testsData?.data?.find((t) => t.id === testId);
  const testModules = (modulesData ?? []).filter((m) =>
    test?.module_ids?.includes(m.id)
  );

  const isLoading = isLoadingTests || isLoadingModules;

  if (isLoading) {
    return (
      <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="h-40 animate-pulse border-2 border-border bg-card shadow-[8px_8px_0_var(--border)]" />
          <div className="h-96 animate-pulse border-2 border-border bg-card shadow-[8px_8px_0_var(--border)]" />
        </div>
      </main>
    );
  }

  if (!test) {
    return (
      <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
        <div className="mx-auto max-w-4xl border-2 border-border border-dashed bg-background p-8 text-center shadow-[8px_8px_0_var(--border)]">
          <h2 className="font-bold text-xl">
            {t('teachModules.testNotFound')}
          </h2>
          <p className="mt-2 text-muted-foreground">
            {t('teachModules.testNotFoundDescription')}
          </p>
          <Link
            href={`/${wsId}/modules/${courseId}`}
            className="mt-4 inline-flex items-center gap-2 border-2 border-border bg-primary px-4 py-2 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('teachModules.backToModules')}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-root-background px-5 py-5 text-foreground md:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page Header */}
        <div className="border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)] md:p-8">
          <Link
            href={`/${wsId}/modules/${courseId}`}
            className="mb-5 inline-flex items-center gap-2 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('teachModules.backToModules')}
          </Link>

          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15 shadow-[4px_4px_0_var(--border)]">
                <BookOpenCheck className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-2 inline-flex items-center gap-1.5 border-2 border-border bg-dynamic-yellow/15 px-3 py-1 font-black text-xs shadow-[3px_3px_0_var(--border)]">
                  <GraduationCap className="h-3.5 w-3.5" />
                  {workspaceName ?? 'Workspace'}
                </p>
                <h1 className="break-words font-black text-[clamp(1.75rem,3.5vw,3rem)] leading-none tracking-normal">
                  {test.name}
                </h1>
              </div>
            </div>

            <button
              onClick={() => {
                toast.success('Starting test session...');
              }}
              className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 self-start border-2 border-border bg-primary px-5 py-3 font-bold text-base text-primary-foreground shadow-[4px_4px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[5px_5px_0_var(--border)] active:translate-y-0 active:shadow-[2px_2px_0_var(--border)] md:self-center"
              type="button"
            >
              <Play className="h-5 w-5" />
              {t('teachModules.startTest')}
            </button>
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
                {t('teachModules.testDetailsStartAt')}
              </span>
              <span className="font-bold text-sm">
                {test.start_at
                  ? new Date(test.start_at).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : t('teachModules.notScheduled')}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-muted/40">
              <Clock className="h-5 w-5" />
            </span>
            <div>
              <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('teachModules.testDetailsDuration')}
              </span>
              <span className="font-bold text-sm">
                {test.duration_in_minutes
                  ? t('teachModules.durationMinutes', {
                      minutes: test.duration_in_minutes,
                    })
                  : t('teachModules.untimed')}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-muted/40">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <span className="block font-black text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('teachModules.submittingType')}
              </span>
              <span className="font-bold text-sm">
                {t('teachModules.onlineTest')}
              </span>
            </div>
          </div>
        </div>

        {/* Description / Instructions */}
        <div className="space-y-4 border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)]">
          <h2 className="border-border border-b-2 pb-2 font-black text-lg uppercase tracking-wider">
            {t('teachModules.assessmentOverview')}
          </h2>
          <div className="whitespace-pre-wrap text-muted-foreground text-sm leading-relaxed">
            {test.description || t('teachModules.noInstructions')}
          </div>
        </div>

        {/* Learning Objectives Assessed */}
        <div className="space-y-4 border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)]">
          <h2 className="border-border border-b-2 pb-2 font-black text-lg uppercase tracking-wider">
            {t('teachModules.learningObjectivesAssessed')}
          </h2>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t('teachModules.learningObjectivesDescription')}
          </p>
          {testModules.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              {t('teachModules.noAssociatedModules')}
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
