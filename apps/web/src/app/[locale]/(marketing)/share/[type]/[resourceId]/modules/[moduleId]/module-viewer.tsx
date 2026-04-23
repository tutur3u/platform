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
import { YoutubeEmbed } from '@tuturuuu/ui/custom/education/modules/youtube/embed';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { extractYoutubeId } from '@/utils/url-helper';

interface ModuleSectionProps {
  content?: ReactNode;
  icon: ReactNode;
  rawContent?: JSONContent | null;
  title: ReactNode;
}

interface ModuleViewerProps {
  group: SharedCourseGroup;
  module: SharedCourseModule;
  moduleIndex: number;
  totalModules: number;
  previousModuleId?: string | null;
  nextModuleId?: string | null;
}

function hasVisibleRichContent(content?: JSONContent | null) {
  return (content?.content ?? []).some(
    (node) => node.type !== 'paragraph' || (node.content?.length ?? 0) > 0
  );
}

function extractTextFromContent(content?: JSONContent | null): string {
  if (!content) return '';

  if (typeof content.text === 'string') {
    return content.text;
  }

  return (content.content ?? []).map(extractTextFromContent).join(' ');
}

function ModuleSection({
  title,
  icon,
  content,
  rawContent,
}: ModuleSectionProps) {
  const isContentEmpty = rawContent
    ? !hasVisibleRichContent(rawContent)
    : !content;

  if (isContentEmpty) return null;

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

export function ModuleViewer({
  group,
  module,
  moduleIndex,
  totalModules,
  previousModuleId,
  nextModuleId,
}: ModuleViewerProps) {
  const t = useTranslations();
  const params = useParams<{
    locale?: string;
    resourceId?: string;
    type?: string;
  }>();
  const moduleSummary = extractTextFromContent(module.content).replaceAll(
    /\s+/g,
    ' '
  );
  const basePath = params?.resourceId
    ? `/${params.locale ?? ''}/share/${params.type ?? 'course'}/${params.resourceId}`
        .replace('//', '/')
        .replace(/\/$/, '')
    : '/share/course';

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_10%_-10%,hsl(var(--foreground)/0.08),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_420px_at_90%_-10%,hsl(var(--foreground)/0.06),transparent_60%)]" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(var(--foreground)/0.05)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground)/0.05)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="flex flex-wrap items-center gap-3 text-foreground/60 text-sm">
          <Link
            href={basePath}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 font-semibold text-foreground/70 text-xs transition hover:bg-muted/60"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t('share-course.back_to_modules')}
          </Link>
          <span className="text-foreground/30">/</span>
          <span className="text-foreground/70">{group.name}</span>
        </div>

        <div className="mt-6 rounded-2xl border border-border/60 bg-[linear-gradient(120deg,hsl(var(--foreground)/0.04),transparent_60%),linear-gradient(220deg,hsl(var(--foreground)/0.08),transparent_40%)] p-8 shadow-sm">
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
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-col gap-6">
            {module.content && (
              <ModuleSection
                title={t('course-details-tabs.module_content')}
                icon={<Goal className="h-4 w-4" />}
                rawContent={module.content}
                content={
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <RichTextEditor
                      content={module.content as JSONContent}
                      readOnly
                    />
                  </div>
                }
              />
            )}

            {(module.youtube_links ?? []).length > 0 && (
              <ModuleSection
                title={t('course-details-tabs.youtube_links')}
                icon={<Youtube className="h-4 w-4" />}
                content={
                  <div className="grid gap-4">
                    {(module.youtube_links ?? []).map((link: string) => (
                      <YoutubeEmbed
                        key={link}
                        embedId={extractYoutubeId(link)}
                      />
                    ))}
                  </div>
                }
              />
            )}

            {module.extra_content && (
              <ModuleSection
                title={t('course-details-tabs.extra_reading')}
                icon={<BookText className="h-4 w-4" />}
                rawContent={module.extra_content as JSONContent}
                content={
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <RichTextEditor
                      content={module.extra_content as JSONContent}
                      readOnly
                    />
                  </div>
                }
              />
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
              <div className="text-foreground/60 text-xs uppercase tracking-[0.18em]">
                {t('share-course.module_progress')}
              </div>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>{t('ws-quizzes.plural')}</span>
                  <Badge variant="outline" className="rounded-full">
                    {module.quizzes}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('ws-quiz-sets.plural')}</span>
                  <Badge variant="outline" className="rounded-full">
                    {module.quizSets}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('ws-flashcards.plural')}</span>
                  <Badge variant="outline" className="rounded-full">
                    {module.flashcards}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
              <div className="text-foreground/60 text-xs uppercase tracking-[0.18em]">
                {t('share-course.module_navigation')}
              </div>
              <div className="mt-3 flex flex-col gap-2 text-sm">
                {previousModuleId ? (
                  <Link
                    href={`${basePath}/modules/${previousModuleId}`}
                    className="inline-flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2 text-foreground/70 transition hover:bg-muted/60"
                  >
                    <span>{t('share-course.previous_module')}</span>
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                ) : null}
                {nextModuleId ? (
                  <Link
                    href={`${basePath}/modules/${nextModuleId}`}
                    className="inline-flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2 text-foreground/70 transition hover:bg-muted/60"
                  >
                    <span>{t('share-course.next_module')}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-dynamic-green/20 bg-dynamic-green/10 p-4 text-dynamic-green text-sm">
              {t('share-course.module_hint')}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
