'use client';

import { Check, Lock, Star } from '@tuturuuu/icons';
import type { TulearnCourseSummary } from '@tuturuuu/internal-api';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { courseThemes } from './shared';

export function CourseCard({
  course,
  index,
  stacked,
}: {
  course: TulearnCourseSummary;
  index: number;
  stacked?: boolean;
}) {
  const t = useTranslations();
  const theme = courseThemes[index % courseThemes.length] ?? courseThemes[0];
  const Icon = theme.icon;
  const nodes = Math.max(1, Math.min(course.totalModules || 1, 6));

  return (
    <article
      className={cn(
        'group rounded-[2rem] border bg-card p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md md:p-6',
        theme.border
      )}
      data-stack-card={stacked ? '' : undefined}
      data-tulearn-reveal
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-center">
        <div>
          <div className="mb-5 flex items-center gap-3">
            <div
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-[1.25rem]',
                theme.surface,
                theme.text
              )}
            >
              <Icon className="h-7 w-7" />
            </div>
            <div>
              <p className="font-bold text-2xl tracking-normal">
                {course.name}
              </p>
              <p className="text-muted-foreground text-sm">
                {t('courses.modules')}: {course.completedModules}/
                {course.totalModules}
              </p>
            </div>
          </div>
          <p className="line-clamp-2 max-w-2xl text-muted-foreground leading-7">
            {course.description ?? t('courses.empty')}
          </p>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between font-semibold text-sm">
              <span>{t('home.learningPath')}</span>
              <span>{course.progress}%</span>
            </div>
            <Progress value={course.progress} />
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: nodes }).map((_, nodeIndex) => {
            const completed = nodeIndex < course.completedModules;
            const current = !completed && nodeIndex === course.completedModules;
            return (
              <div
                className={cn(
                  'flex aspect-square min-h-11 items-center justify-center rounded-2xl border transition duration-300 group-hover:scale-105',
                  completed &&
                    'border-dynamic-green/30 bg-dynamic-green text-primary-foreground',
                  current &&
                    'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
                  !completed &&
                    !current &&
                    'border-border bg-muted/50 text-muted-foreground'
                )}
                key={`${course.id}-${nodeIndex}`}
              >
                {completed ? (
                  <Check className="h-5 w-5" />
                ) : current ? (
                  <Star className="h-5 w-5" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
