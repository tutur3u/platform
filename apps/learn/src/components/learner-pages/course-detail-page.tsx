'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronLeft, ChevronRight, Youtube } from '@tuturuuu/icons';
import {
  getSharedCourseContent,
  type SharedCourseContentResponse,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ModuleDetailView } from './module-detail-view';
import { BrutalCard, EmptyState, LoadingState, useStudentHref } from './shared';

export type CourseModule = SharedCourseContentResponse['modules'][number];

export function CourseDetailPage({
  courseId,
  wsId,
}: {
  courseId: string;
  wsId: string;
}) {
  const t = useTranslations();
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const coursesHref = useStudentHref(`/${wsId}/courses`);

  const course = useQuery({
    queryFn: () => getSharedCourseContent(courseId),
    queryKey: ['course-detail', courseId],
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

  const { group, modules } = course.data;
  const selectedModule = modules.find((m) => m.id === selectedModuleId) ?? null;
  const selectedIndex = selectedModule ? modules.indexOf(selectedModule) : -1;
  const previousModule = selectedIndex > 0 ? modules[selectedIndex - 1] : null;
  const nextModule =
    selectedIndex >= 0 && selectedIndex < modules.length - 1
      ? modules[selectedIndex + 1]
      : null;

  if (selectedModule) {
    return (
      <ModuleDetailView
        courseModule={selectedModule}
        group={group}
        moduleIndex={selectedIndex}
        nextModule={nextModule ?? undefined}
        onBack={() => setSelectedModuleId(null)}
        onNavigate={(id) => setSelectedModuleId(id)}
        previousModule={previousModule ?? undefined}
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
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition hover:bg-muted/60"
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
              const videos = courseModule.youtube_links ?? [];
              return (
                <BrutalCard key={courseModule.id} className="p-0">
                  <button
                    className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/30"
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
                        {courseModule.quizzes > 0 && (
                          <span>
                            {t('courses.quizCount', {
                              count: courseModule.quizzes,
                            })}
                          </span>
                        )}
                        {courseModule.flashcards > 0 && (
                          <span>
                            {t('courses.flashcardCount', {
                              count: courseModule.flashcards,
                            })}
                          </span>
                        )}
                        {videos.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Youtube className="h-3 w-3" />
                            {t('courses.videoCount', {
                              count: videos.length,
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="flex items-center gap-1 font-bold text-muted-foreground text-sm transition group-hover:text-foreground">
                      {t('courses.openModule')}
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </button>
                </BrutalCard>
              );
            })}
          </div>

          {!modules.length ? <EmptyState label={t('courses.empty')} /> : null}
        </div>
      </div>
    </div>
  );
}
