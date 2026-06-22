'use client';

import { BookOpenText, ChevronRight } from '@tuturuuu/icons';
import type { SharedCourseGroup, SharedCourseModule } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'use-intl';

type CourseViewerProps = {
  group: SharedCourseGroup;
  locale: string;
  modules: SharedCourseModule[];
  resourceId: string;
  type: string;
};

function moduleHref({
  locale,
  moduleId,
  resourceId,
  type,
}: {
  locale: string;
  moduleId: string;
  resourceId: string;
  type: string;
}) {
  return `/${locale}/share/${type}/${resourceId}/modules/${moduleId}`;
}

export function CourseViewer({
  group,
  locale,
  modules,
  resourceId,
  type,
}: CourseViewerProps) {
  const t = useTranslations();

  if (modules.length === 0) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <div className="flex min-h-52 items-center justify-center rounded-2xl border border-foreground/20 border-dashed bg-foreground/5 text-center text-foreground/60 text-sm">
          {t('share-course.no_published_modules')}
        </div>
      </div>
    );
  }

  const getModuleHref = (moduleId: string) =>
    moduleHref({ locale, moduleId, resourceId, type });

  return (
    <div className="relative">
      <CourseBackdrop />
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[280px_1fr]">
          <aside className="sticky top-20 flex flex-col gap-6">
            <CourseSummaryCard group={group} moduleCount={modules.length} />
            <CourseOutline getModuleHref={getModuleHref} modules={modules} />
          </aside>

          <main className="flex flex-col gap-6">
            <div>
              <p className="text-foreground/50 text-xs uppercase tracking-[0.18em]">
                {t('share-course.modules_heading')}
              </p>
              <h2 className="mt-2 font-semibold text-3xl text-foreground tracking-tight">
                {group.name}
              </h2>
              <p className="mt-1 text-foreground/60 text-sm">
                {t('share-course.select_module')}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {modules.map((module, index) => (
                <ModuleListCard
                  href={getModuleHref(module.id)}
                  index={index}
                  key={module.id}
                  module={module}
                />
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function CourseBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_10%_-10%,hsl(var(--foreground)/0.08),transparent_65%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(700px_420px_at_90%_-10%,hsl(var(--foreground)/0.06),transparent_60%)]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(var(--foreground)/0.05)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground)/0.05)_1px,transparent_1px)] [background-size:28px_28px]" />
    </div>
  );
}

function CourseSummaryCard({
  group,
  moduleCount,
}: {
  group: SharedCourseGroup;
  moduleCount: number;
}) {
  const t = useTranslations();

  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-5 shadow-sm">
      <div className="inline-flex w-fit items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
        <BookOpenText className="h-3.5 w-3.5" />
        {t('share-course.badge')}
      </div>
      <h1 className="mt-3 font-semibold text-2xl text-foreground tracking-tight">
        {group.name}
      </h1>
      {group.description ? (
        <p className="mt-2 text-foreground/60 text-sm leading-relaxed">
          {group.description}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="secondary">
          {t('share-course.published_modules', { count: moduleCount })}
        </Badge>
      </div>
    </div>
  );
}

function CourseOutline({
  getModuleHref,
  modules,
}: {
  getModuleHref: (moduleId: string) => string;
  modules: SharedCourseModule[];
}) {
  const t = useTranslations();

  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
      <div className="flex items-center justify-between border-border/40 border-b pb-3">
        <div className="font-semibold text-foreground/80 text-sm">
          {t('share-course.course_outline')}
        </div>
        <span className="text-foreground/50 text-xs">{modules.length}</span>
      </div>
      <div className="mt-3 flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
        {modules.map((module, index) => (
          <a
            className="group flex items-start gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition hover:border-border/60 hover:bg-muted/40"
            href={getModuleHref(module.id)}
            key={module.id}
          >
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-[11px] text-foreground/70">
              {index + 1}
            </div>
            <ModuleSummary module={module} />
          </a>
        ))}
      </div>
    </div>
  );
}

function ModuleSummary({ module }: { module: SharedCourseModule }) {
  const t = useTranslations();

  return (
    <div className="flex-1 text-foreground/80 text-sm">
      <div className="font-medium text-foreground group-hover:text-foreground">
        {module.name}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-foreground/50">
        {module.quizzes > 0 ? (
          <span>
            {t('share-course.quiz_short')} {module.quizzes}
          </span>
        ) : null}
        {module.quizSets > 0 ? (
          <span>
            {t('share-course.quiz_set_short')} {module.quizSets}
          </span>
        ) : null}
        {module.flashcards > 0 ? (
          <span>
            {t('share-course.flashcard_short')} {module.flashcards}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ModuleListCard({
  href,
  index,
  module,
}: {
  href: string;
  index: number;
  module: SharedCourseModule;
}) {
  const t = useTranslations();

  return (
    <a
      className="group rounded-2xl border border-border/60 bg-background/80 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-border/80 hover:bg-background"
      href={href}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted font-semibold text-foreground/70 text-sm">
            {index + 1}
          </div>
          <div>
            <div className="font-semibold text-foreground text-lg">
              {module.name}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <ModuleStatBadges module={module} />
            </div>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 font-semibold text-foreground/60 text-xs transition group-hover:text-foreground/80">
          {t('share-course.view_module')}
          <ChevronRight className={cn('h-3.5 w-3.5 text-foreground/40')} />
        </div>
      </div>
    </a>
  );
}

function ModuleStatBadges({ module }: { module: SharedCourseModule }) {
  const t = useTranslations();
  const stats = [
    ['quiz_label', 'quiz_short', module.quizzes],
    ['quiz_set_label', 'quiz_set_short', module.quizSets],
    ['flashcard_label', 'flashcard_short', module.flashcards],
  ] as const;

  return stats
    .filter(([, , count]) => count > 0)
    .map(([labelKey, shortKey, count]) => (
      <Badge
        aria-label={t(`share-course.${labelKey}`)}
        className="h-5 rounded-sm border-foreground/10 px-1.5 text-[10px] text-foreground/60"
        key={shortKey}
        variant="outline"
      >
        {t(`share-course.${shortKey}`)} {count}
      </Badge>
    ));
}
