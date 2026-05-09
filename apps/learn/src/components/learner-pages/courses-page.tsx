'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type BookOpen,
  ChevronRight,
  FileText,
  Layers,
  Play,
  Zap,
} from '@tuturuuu/icons';
import { type CourseListItem, listCourses } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  BrutalCard,
  courseThemes,
  EmptyState,
  LoadingState,
  Section,
  usePageMotion,
} from './shared';

export function CoursesPage({ wsId }: { wsId: string }) {
  const t = useTranslations();
  const scopeRef = usePageMotion();
  const courses = useQuery({
    queryFn: () => listCourses(wsId),
    queryKey: ['courses', wsId],
  });

  if (courses.isLoading) return <LoadingState />;

  return (
    <Section
      description={t('courses.mapDescription')}
      refValue={scopeRef}
      title={t('courses.title')}
    >
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {courses.data?.courses.map((course, index) => (
          <CanvasCourseCard course={course} index={index} key={course.id} />
        ))}
      </div>
      {!courses.data?.courses.length ? (
        <EmptyState label={t('courses.empty')} />
      ) : null}
    </Section>
  );
}

function CanvasCourseCard({
  course,
  index,
}: {
  course: CourseListItem;
  index: number;
}) {
  const t = useTranslations();
  const theme = courseThemes[index % courseThemes.length] ?? courseThemes[0];
  const Icon = theme.icon;

  const remaining = course.totalModules - course.completedModules;
  const isComplete = course.progress >= 100;

  return (
    <BrutalCard className="flex flex-col overflow-hidden p-0">
      {/* Canvas-style colored header band */}
      <div
        className={cn(
          'relative flex items-center gap-3 border-border border-b-2 px-5 py-4',
          theme.surface
        )}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-border bg-background shadow-[2px_2px_0_var(--border)]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold text-lg leading-tight">
            {course.name ?? t('courses.untitled')}
          </h3>
          <p className="text-muted-foreground text-xs">
            {course.totalModules} {t('courses.modules').toLowerCase()}
          </p>
        </div>
        {isComplete ? (
          <Badge
            className="shrink-0 border-2 border-border bg-dynamic-green/15 font-bold text-foreground shadow-[2px_2px_0_var(--border)]"
            variant="secondary"
          >
            {t('common.completed')}
          </Badge>
        ) : null}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Description */}
        <p className="line-clamp-2 min-h-[2.5rem] text-muted-foreground text-sm leading-relaxed">
          {course.description ?? t('courses.empty')}
        </p>

        {/* Stats row - Canvas style */}
        <div className="grid grid-cols-3 gap-2">
          <StatChip
            icon={Layers}
            label={t('courses.modules')}
            value={`${course.completedModules}/${course.totalModules}`}
          />
          <StatChip icon={Zap} label="XP" value={`${course.progress}%`} />
          <StatChip
            icon={FileText}
            label={remaining > 0 ? 'Left' : 'Done'}
            value={`${remaining}`}
          />
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-muted-foreground">
              {t('home.learningPath')}
            </span>
            <span className="font-bold">{course.progress}%</span>
          </div>
          <Progress className="h-2.5" value={course.progress} />
        </div>

        {/* Module progress dots - Canvas checkpoint style */}
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: Math.min(course.totalModules, 12) }).map(
            (_, i) => {
              const completed = i < course.completedModules;
              const current = i === course.completedModules;
              return (
                <div
                  className={cn(
                    'h-2.5 w-2.5 border border-border transition-all',
                    completed && 'bg-primary',
                    current &&
                      'bg-dynamic-yellow ring-1 ring-dynamic-yellow/50',
                    !completed && !current && 'bg-muted'
                  )}
                  key={`dot-${course.id}-${i}`}
                />
              );
            }
          )}
          {course.totalModules > 12 ? (
            <span className="text-muted-foreground text-xs">
              +{course.totalModules - 12}
            </span>
          ) : null}
        </div>
      </div>

      {/* Canvas-style footer action */}
      <div className="mt-auto border-border border-t-2 px-5 py-3">
        <button
          className="group/btn flex w-full items-center gap-2 font-bold text-sm transition hover:text-primary"
          type="button"
        >
          <Play className="h-4 w-4" />
          <span>
            {isComplete ? t('common.continue') : t('home.continueCourse')}
          </span>
          <ChevronRight className="ml-auto h-4 w-4 transition group-hover/btn:translate-x-0.5" />
        </button>
      </div>
    </BrutalCard>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 border-2 border-border bg-muted/40 px-2 py-2 text-center">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="font-bold text-sm leading-none">{value}</span>
      <span className="text-[10px] text-muted-foreground leading-none">
        {label}
      </span>
    </div>
  );
}
