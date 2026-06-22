'use client';

import {
  BookOpenText,
  BookText,
  ChevronLeft,
  ChevronRight,
  Goal,
  Youtube,
} from '@tuturuuu/icons';
import type { SharedCourseGroup, SharedCourseModule } from '@tuturuuu/types';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { Badge } from '@tuturuuu/ui/badge';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { extractYoutubeId } from '../../lib/platform/youtube';

type ModuleViewerProps = {
  group: SharedCourseGroup;
  locale: string;
  module: SharedCourseModule;
  moduleIndex: number;
  nextModuleId?: string | null;
  previousModuleId?: string | null;
  resourceId: string;
  totalModules: number;
  type: string;
};

type ModuleSectionProps = {
  content?: ReactNode;
  icon: ReactNode;
  rawContent?: JSONContent | null;
  title: ReactNode;
};

function hasVisibleRichContent(content?: JSONContent | null) {
  return (content?.content ?? []).some(
    (node) => node.type !== 'paragraph' || (node.content?.length ?? 0) > 0
  );
}

function extractTextFromContent(content?: JSONContent | null): string {
  if (!content) {
    return '';
  }

  if (typeof content.text === 'string') {
    return content.text;
  }

  return (content.content ?? []).map(extractTextFromContent).join(' ');
}

function buildCoursePath({
  locale,
  resourceId,
  type,
}: {
  locale: string;
  resourceId: string;
  type: string;
}) {
  return `/${locale}/share/${type}/${resourceId}`;
}

export function ModuleViewer({
  group,
  locale,
  module,
  moduleIndex,
  nextModuleId,
  previousModuleId,
  resourceId,
  totalModules,
  type,
}: ModuleViewerProps) {
  const t = useTranslations();
  const moduleSummary = extractTextFromContent(module.content)
    .replaceAll(/\s+/g, ' ')
    .trim();
  const basePath = buildCoursePath({ locale, resourceId, type });

  return (
    <div className="relative">
      <CourseBackdrop />
      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-wrap items-center gap-3 text-foreground/60 text-sm">
          <a
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 font-semibold text-foreground/70 text-xs transition hover:bg-muted/60"
            href={basePath}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t('share-course.back_to_modules')}
          </a>
          <span className="text-foreground/30">/</span>
          <span className="text-foreground/70">{group.name}</span>
        </div>

        <header className="mt-6 rounded-2xl border border-border/60 bg-[linear-gradient(120deg,hsl(var(--foreground)/0.04),transparent_60%),linear-gradient(220deg,hsl(var(--foreground)/0.08),transparent_40%)] p-8 shadow-sm">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
            <BookOpenText className="h-3.5 w-3.5" />
            {t('share-course.module_label', {
              index: moduleIndex,
              total: totalModules,
            })}
          </div>
          <h1 className="mt-4 font-semibold text-3xl text-foreground tracking-tight">
            {module.name}
          </h1>
          <p className="mt-2 text-foreground/60 text-sm">
            {moduleSummary ||
              group.description ||
              t('share-course.module_subtitle')}
          </p>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <main className="flex flex-col gap-6">
            <ModuleContentSection module={module} />
          </main>

          <ModuleSidebar
            basePath={basePath}
            module={module}
            nextModuleId={nextModuleId}
            previousModuleId={previousModuleId}
          />
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

function ModuleSection({
  content,
  icon,
  rawContent,
  title,
}: ModuleSectionProps) {
  const isContentEmpty = rawContent
    ? !hasVisibleRichContent(rawContent)
    : !content;

  if (isContentEmpty) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border/60 bg-background/80 p-5 shadow-sm">
      <div className="flex items-center gap-2 font-semibold text-base">
        <span className="text-foreground/60">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="mt-3 overflow-hidden text-foreground/80">{content}</div>
    </section>
  );
}

function ModuleContentSection({ module }: { module: SharedCourseModule }) {
  const t = useTranslations();

  return (
    <>
      {module.content ? (
        <ModuleSection
          content={
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <RichTextEditor content={module.content} readOnly />
            </div>
          }
          icon={<Goal className="h-4 w-4" />}
          rawContent={module.content}
          title={t('course-details-tabs.module_content')}
        />
      ) : null}

      {(module.youtube_links ?? []).length > 0 ? (
        <ModuleSection
          content={
            <div className="grid gap-4">
              {(module.youtube_links ?? []).map((link) => (
                <YoutubeEmbed key={link} url={link} />
              ))}
            </div>
          }
          icon={<Youtube className="h-4 w-4" />}
          title={t('course-details-tabs.youtube_links')}
        />
      ) : null}

      {module.extra_content ? (
        <ModuleSection
          content={
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <RichTextEditor
                content={module.extra_content as JSONContent}
                readOnly
              />
            </div>
          }
          icon={<BookText className="h-4 w-4" />}
          rawContent={module.extra_content as JSONContent}
          title={t('course-details-tabs.extra_reading')}
        />
      ) : null}
    </>
  );
}

function YoutubeEmbed({ url }: { url: string }) {
  const t = useTranslations();
  const embedId = extractYoutubeId(url);

  if (!embedId) {
    return <div>{t('ws-course-modules.invalid_youtube_link')}.</div>;
  }

  return (
    <iframe
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      className="aspect-video h-48 w-full rounded-lg md:h-64 lg:h-96"
      height="480"
      referrerPolicy="strict-origin-when-cross-origin"
      src={`https://www.youtube.com/embed/${embedId}`}
      title="Embedded youtube"
      width="853"
    />
  );
}

function ModuleSidebar({
  basePath,
  module,
  nextModuleId,
  previousModuleId,
}: {
  basePath: string;
  module: SharedCourseModule;
  nextModuleId?: string | null;
  previousModuleId?: string | null;
}) {
  const t = useTranslations();

  return (
    <aside className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
        <div className="text-foreground/60 text-xs uppercase tracking-[0.18em]">
          {t('share-course.module_progress')}
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          <ProgressRow count={module.quizzes} label={t('ws-quizzes.plural')} />
          <ProgressRow
            count={module.quizSets}
            label={t('ws-quiz-sets.plural')}
          />
          <ProgressRow
            count={module.flashcards}
            label={t('ws-flashcards.plural')}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
        <div className="text-foreground/60 text-xs uppercase tracking-[0.18em]">
          {t('share-course.module_navigation')}
        </div>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {previousModuleId ? (
            <ModuleNavigationLink
              href={`${basePath}/modules/${previousModuleId}`}
              icon={<ChevronLeft className="h-4 w-4" />}
              label={t('share-course.previous_module')}
            />
          ) : null}
          {nextModuleId ? (
            <ModuleNavigationLink
              href={`${basePath}/modules/${nextModuleId}`}
              icon={<ChevronRight className="h-4 w-4" />}
              label={t('share-course.next_module')}
            />
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-dynamic-green/20 bg-dynamic-green/10 p-4 text-dynamic-green text-sm">
        {t('share-course.module_hint')}
      </div>
    </aside>
  );
}

function ProgressRow({ count, label }: { count: number; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <Badge className="rounded-full" variant="outline">
        {count}
      </Badge>
    </div>
  );
}

function ModuleNavigationLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <a
      className="inline-flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2 text-foreground/70 transition hover:bg-muted/60"
      href={href}
    >
      <span>{label}</span>
      {icon}
    </a>
  );
}
