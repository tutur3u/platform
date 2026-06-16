'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronLeft, ChevronRight, Play } from '@tuturuuu/icons';
import {
  getTulearnCourse,
  getTulearnCourseModule,
  type TulearnCourseDetail,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ModuleDetailView } from './module-detail-view';
import {
  BrutalCard,
  EmptyState,
  LoadingState,
  useStudentHref,
  useStudentId,
} from './shared';

export type CourseModule = TulearnCourseDetail['modules'][number];

export function CourseDetailPage({
  courseId,
  wsId,
}: {
  courseId: string;
  wsId: string;
}) {
  const t = useTranslations();
  const studentId = useStudentId();
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const coursesHref = useStudentHref(`/${wsId}/courses`);

  const course = useQuery({
    queryFn: () => getTulearnCourse(wsId, courseId, studentId),
    queryKey: ['tulearn', wsId, studentId, 'course', courseId],
  });

  const modules = course.data?.modules ?? [];
  const tests = course.data?.tests ?? [];
  const selectedModule =
    modules.find((module) => module.id === selectedModuleId) ?? null;
  const selectedModuleDetail = useQuery({
    enabled: Boolean(selectedModule && !selectedModule.locked),
    queryFn: () =>
      getTulearnCourseModule(
        wsId,
        courseId,
        selectedModule?.id ?? '',
        studentId
      ),
    queryKey: [
      'tulearn',
      wsId,
      studentId,
      'course-module',
      courseId,
      selectedModule?.id,
    ],
  });

  if (course.isLoading) return <LoadingState />;
  if (course.isError) {
    return (
      <EmptyState
        action={
          <button
            className="border-2 border-border bg-background px-4 py-2 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
            onClick={() => course.refetch()}
            type="button"
          >
            {t('common.retry')}
          </button>
        }
        label={t('courses.loadError')}
      />
    );
  }
  if (!course.data) return <EmptyState label={t('courses.empty')} />;

  const group = {
    description: course.data.description,
    name: course.data.name,
  };
  const selectedIndex = selectedModule ? modules.indexOf(selectedModule) : -1;
  const previousModule = selectedIndex > 0 ? modules[selectedIndex - 1] : null;
  const nextModule =
    selectedIndex >= 0 && selectedIndex < modules.length - 1
      ? modules[selectedIndex + 1]
      : null;

  if (selectedModule) {
    if (selectedModule.locked) {
      return (
        <EmptyState
          action={
            <button
              className="border-2 border-border bg-background px-4 py-2 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
              onClick={() => setSelectedModuleId(null)}
              type="button"
            >
              {t('common.back')}
            </button>
          }
          label={t('courses.locked')}
        />
      );
    }

    if (selectedModuleDetail.isLoading) return <LoadingState />;
    if (selectedModuleDetail.isError || !selectedModuleDetail.data) {
      return (
        <EmptyState
          action={
            <button
              className="border-2 border-border bg-background px-4 py-2 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
              onClick={() => selectedModuleDetail.refetch()}
              type="button"
            >
              {t('common.retry')}
            </button>
          }
          label={t('courses.loadError')}
        />
      );
    }

    return (
      <ModuleDetailView
        courseModule={selectedModuleDetail.data}
        group={group}
        moduleIndex={selectedIndex}
        nextModule={nextModule && !nextModule.locked ? nextModule : undefined}
        onBack={() => setSelectedModuleId(null)}
        onNavigate={(id) => setSelectedModuleId(id)}
        previousModule={
          previousModule && !previousModule.locked ? previousModule : undefined
        }
        totalModules={modules.length}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
        href={coursesHref}
      >
        <ChevronLeft className="h-4 w-4" />
        {t('common.back')}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <BrutalCard className="p-5">
            <Badge className="mb-3 border-2 border-border bg-dynamic-yellow/15 font-bold text-foreground shadow-[2px_2px_0_var(--border)]">
              <BookOpen className="mr-1.5 h-3 w-3" />
              {t('courses.sharedCourse')}
            </Badge>
            <h2 className="font-black text-xl leading-tight">
              {group.name ?? t('courses.untitled')}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('courses.publishedModules', { count: modules.length })}
            </p>
          </BrutalCard>

          <BrutalCard className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {t('courses.courseOutline')}
              </h3>
              <span className="text-muted-foreground text-xs">
                {modules.length}
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              {modules.map((courseModule, index) => (
                <button
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition',
                    courseModule.locked
                      ? 'cursor-not-allowed opacity-60'
                      : 'hover:bg-muted/60'
                  )}
                  disabled={courseModule.locked}
                  key={courseModule.id}
                  onClick={() => setSelectedModuleId(courseModule.id)}
                  type="button"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-border bg-muted font-bold text-[10px]">
                    {index + 1}
                  </span>
                  <span className="truncate">
                    {courseModule.name ?? t('courses.untitled')}
                  </span>
                  {courseModule.locked ? (
                    <span className="ml-auto text-[10px] text-muted-foreground uppercase">
                      {t('courses.locked')}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </BrutalCard>
        </aside>

        <div className="space-y-5">
          <div>
            <p className="font-bold text-muted-foreground text-xs uppercase tracking-widest">
              {t('courses.modules')}
            </p>
            <h1 className="mt-1 font-black text-3xl leading-tight tracking-normal">
              {group.name ?? t('courses.untitled')}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('courses.selectModule')}
            </p>
          </div>

          <div className="space-y-3">
            {modules.map((courseModule, index) => {
              return (
                <BrutalCard key={courseModule.id} className="p-0">
                  <button
                    className={cn(
                      'flex w-full items-center gap-4 px-5 py-4 text-left transition',
                      courseModule.locked
                        ? 'cursor-not-allowed opacity-60'
                        : 'hover:bg-muted/30'
                    )}
                    disabled={courseModule.locked}
                    onClick={() => setSelectedModuleId(courseModule.id)}
                    type="button"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-primary font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)]">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-bold text-base">
                        {courseModule.name ?? t('courses.untitled')}
                      </h3>
                      <div className="mt-0.5 flex items-center gap-3 text-muted-foreground text-xs">
                        {courseModule.counts.quizzes > 0 && (
                          <span>
                            {t('courses.quizCount', {
                              count: courseModule.counts.quizzes,
                            })}
                          </span>
                        )}
                        {courseModule.counts.flashcards > 0 && (
                          <span>
                            {t('courses.flashcardCount', {
                              count: courseModule.counts.flashcards,
                            })}
                          </span>
                        )}
                        {courseModule.locked ? (
                          <span>{t('courses.locked')}</span>
                        ) : null}
                      </div>
                    </div>
                    <span className="flex items-center gap-1 font-bold text-muted-foreground text-sm transition group-hover:text-foreground">
                      {courseModule.locked
                        ? t('courses.locked')
                        : t('courses.openModule')}
                      {!courseModule.locked ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : null}
                    </span>
                  </button>
                </BrutalCard>
              );
            })}
          </div>

          {!modules.length ? <EmptyState label={t('courses.empty')} /> : null}

          {/* Tests Section */}
          {tests.length > 0 && (
            <div className="space-y-4 border-border border-t pt-6">
              <div>
                <p className="font-bold text-muted-foreground text-xs uppercase tracking-widest">
                  {t('courses.tests')}
                </p>
                <h2 className="mt-1 font-black text-2xl leading-tight tracking-normal">
                  {t('courses.courseAssessments')}
                </h2>
              </div>

              <div className="space-y-3">
                {tests.map((test, index) => {
                  return (
                    <BrutalCard key={test.id} className="p-0">
                      <div className="flex w-full items-center gap-4 px-5 py-4 text-left">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15 font-bold text-foreground text-sm shadow-[2px_2px_0_var(--border)]">
                          T{index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-bold text-base">
                            {test.name}
                          </h3>
                          {test.description && (
                            <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                              {test.description}
                            </p>
                          )}
                          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
                            {test.start_at && (
                              <span>
                                {t('courses.testDetailsStartAt')}:{' '}
                                {new Date(test.start_at).toLocaleString([], {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </span>
                            )}
                            {test.duration_in_minutes && (
                              <span>
                                {t('courses.testDetailsDuration')}:{' '}
                                {t('courses.durationMinutes', {
                                  minutes: test.duration_in_minutes,
                                })}
                              </span>
                            )}
                            <span>{t('courses.onlineTest')}</span>
                          </div>
                        </div>

                        <Link
                          href={
                            studentId
                              ? `/${wsId}/courses/${courseId}/tests/${test.id}?studentId=${studentId}`
                              : `/${wsId}/courses/${courseId}/tests/${test.id}`
                          }
                          className="inline-flex cursor-pointer items-center justify-center gap-1.5 border-2 border-border bg-primary px-3.5 py-1.5 font-bold text-primary-foreground text-xs shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)] active:translate-y-0 active:shadow-[1px_1px_0_var(--border)]"
                        >
                          <Play className="h-3.5 w-3.5" />
                          {t('courses.startTest')}
                        </Link>
                      </div>
                    </BrutalCard>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
