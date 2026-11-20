'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Play } from '@tuturuuu/icons';
import {
  getTulearnCourse,
  getTulearnCourseModule,
  type TulearnCourseDetail,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CourseLearningPath } from './course-learning-path';
import { ModuleDetailView } from './module-detail-view';
import {
  EmptyState,
  LoadingState,
  SurfaceCard,
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
  const requestedModuleId = useSearchParams().get('moduleId');
  const selectionScope = JSON.stringify([
    wsId,
    courseId,
    studentId,
    requestedModuleId,
  ]);
  const [selection, setSelection] = useState<{
    scope: string;
    moduleId: string | null;
  }>();
  const selectedModuleId =
    selection?.scope === selectionScope
      ? selection.moduleId
      : requestedModuleId;
  const setSelectedModuleId = (moduleId: string | null) =>
    setSelection({ scope: selectionScope, moduleId });
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
    enabled: Boolean(selectedModule?.is_published && !selectedModule.locked),
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
            className="rounded-lg border border-border bg-background px-4 py-2 font-bold text-sm transition"
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
    if (selectedModule.locked || !selectedModule.is_published) {
      return (
        <EmptyState
          action={
            <button
              className="rounded-lg border border-border bg-background px-4 py-2 font-bold text-sm transition"
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
              className="rounded-lg border border-border bg-background px-4 py-2 font-bold text-sm transition"
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
        nextModule={
          nextModule?.is_published && !nextModule.locked
            ? nextModule
            : undefined
        }
        onBack={() => setSelectedModuleId(null)}
        onNavigate={(id) => setSelectedModuleId(id)}
        previousModule={
          previousModule?.is_published && !previousModule.locked
            ? previousModule
            : undefined
        }
        totalModules={modules.length}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild size="sm" variant="outline">
        <Link href={coursesHref}>
          <ChevronLeft aria-hidden />
          {t('common.back')}
        </Link>
      </Button>

      <div>
        <h1 className="font-semibold text-3xl leading-tight tracking-tight">
          {group.name ?? t('courses.untitled')}
        </h1>
        {group.description && (
          <p className="mt-2 text-muted-foreground text-sm">
            {group.description}
          </p>
        )}
      </div>

      <CourseLearningPath
        course={course.data}
        onOpenModule={setSelectedModuleId}
      />

      {/* Tests Section */}
      {tests.length > 0 && (
        <div className="space-y-4 border-border border-t pt-6">
          <div>
            <p className="font-bold text-muted-foreground text-xs uppercase tracking-widest">
              {t('courses.tests')}
            </p>
            <h2 className="mt-1 font-semibold text-2xl leading-tight tracking-normal">
              {t('courses.courseAssessments')}
            </h2>
          </div>

          <div className="space-y-3">
            {tests.map((test, index) => {
              return (
                <SurfaceCard key={test.id} className="p-0">
                  <div className="flex w-full items-center gap-4 px-5 py-4 text-left">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-dynamic-cyan/15 font-bold text-foreground text-sm">
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
                      className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border bg-primary px-3.5 py-1.5 font-bold text-primary-foreground text-xs transition"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {t('courses.startTest')}
                    </Link>
                  </div>
                </SurfaceCard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
