'use client';

import { ArrowRight, Check, ChevronRight, Lock } from '@tuturuuu/icons';
import type { TulearnCourseDetail } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { useTranslations } from 'next-intl';

type CourseModule = TulearnCourseDetail['modules'][number];

export function getNextCourseModule(modules: CourseModule[]) {
  return modules.find(
    (module) => module.is_published && !module.locked && !module.completed
  );
}

export function CourseLearningPath({
  course,
  onOpenModule,
}: {
  course: Pick<
    TulearnCourseDetail,
    'completedModules' | 'modules' | 'progress' | 'totalModules'
  >;
  onOpenModule: (id: string) => void;
}) {
  const t = useTranslations();
  const next = getNextCourseModule(course.modules);
  return (
    <Card
      aria-labelledby="course-learning-path"
      className="gap-4"
      role="region"
    >
      <CardHeader className="gap-3">
        <CardTitle id="course-learning-path">
          {t('courses.courseOutline')}
        </CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            {t('learnerWorkspace.moduleCompletion', {
              completed: course.completedModules,
              total: course.totalModules,
            })}
          </p>
          {next && (
            <Button
              onClick={() => onOpenModule(next.id)}
              size="sm"
              type="button"
            >
              {t('learnerWorkspace.resumeLesson')}
              <ArrowRight aria-hidden />
            </Button>
          )}
        </div>
        {course.totalModules > 0 && (
          <Progress
            aria-label={t('home.learningPath')}
            aria-valuenow={course.progress}
            indicatorClassName="motion-reduce:transition-none"
            value={course.progress}
          />
        )}
      </CardHeader>
      <CardContent>
        {course.modules.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('courses.empty')}</p>
        ) : (
          <ol className="divide-y divide-border">
            {course.modules.map((module, index) => {
              const locked = module.locked || !module.is_published;
              const status = locked
                ? t('courses.locked')
                : module.completed
                  ? t('common.completed')
                  : t('courses.openModule');
              return (
                <li key={module.id}>
                  <Button
                    className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 whitespace-normal py-3 text-left disabled:opacity-75"
                    disabled={locked}
                    onClick={() => onOpenModule(module.id)}
                    type="button"
                    variant="ghost"
                  >
                    <span
                      aria-hidden
                      className="grid size-8 place-items-center rounded-md border border-border bg-muted tabular-nums"
                    >
                      {locked ? (
                        <Lock />
                      ) : module.completed ? (
                        <Check />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block wrap-break-word font-medium">
                        {module.name || t('courses.untitled')}
                      </span>
                      {(module.counts.quizzes > 0 ||
                        module.counts.flashcards > 0) && (
                        <span className="flex flex-wrap gap-2 text-muted-foreground text-xs">
                          {module.counts.quizzes > 0 && (
                            <span>
                              {t('courses.quizCount', {
                                count: module.counts.quizzes,
                              })}
                            </span>
                          )}
                          {module.counts.flashcards > 0 && (
                            <span>
                              {t('courses.flashcardCount', {
                                count: module.counts.flashcards,
                              })}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">
                      {status}
                      {!locked && (
                        <ChevronRight aria-hidden className="hidden sm:block" />
                      )}
                    </span>
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
