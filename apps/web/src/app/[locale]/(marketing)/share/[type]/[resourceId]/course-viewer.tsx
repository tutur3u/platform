'use client';

import {
  BookOpenText,
  BookText,
  ChevronRight,
  Goal,
  ListTodo,
  SwatchBook,
  Youtube,
} from '@tuturuuu/icons';
import type { SharedCourseGroup, SharedCourseModule } from '@tuturuuu/types';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { Badge } from '@tuturuuu/ui/badge';
import { YoutubeEmbed } from '@tuturuuu/ui/custom/education/modules/youtube/embed';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { extractYoutubeId } from '@/utils/url-helper';

interface CourseViewerProps {
  group: SharedCourseGroup;
  modules: SharedCourseModule[];
}

interface ModuleSectionProps {
  content?: ReactNode;
  icon: ReactNode;
  rawContent?: JSONContent | null;
  title: ReactNode;
}

function hasVisibleRichContent(content?: JSONContent | null) {
  return (content?.content ?? []).some(
    (node) => node.type !== 'paragraph' || (node.content?.length ?? 0) > 0
  );
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
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/70 p-4 shadow-sm">
      <div className="flex items-center gap-2 font-semibold text-base">
        <span className="text-foreground/60">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="overflow-hidden text-foreground/80">{content}</div>
    </div>
  );
}

export function CourseViewer({ group, modules }: CourseViewerProps) {
  const t = useTranslations();
  const [openModuleIds, setOpenModuleIds] = useState(() => {
    const firstModule = modules[0];
    return firstModule ? new Set([firstModule.id]) : new Set<string>();
  });

  const anyOpen = openModuleIds.size > 0;
  const allOpen = openModuleIds.size === modules.length;

  const toggleAll = () => {
    if (allOpen || anyOpen) {
      setOpenModuleIds(new Set());
      return;
    }

    setOpenModuleIds(new Set(modules.map((module) => module.id)));
  };

  const toggleModule = (moduleId: string) => {
    setOpenModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  if (modules.length === 0) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-10">
        <div className="flex min-h-52 items-center justify-center rounded-2xl border border-foreground/20 border-dashed bg-foreground/5 text-center text-foreground/60 text-sm">
          {t('share-course.no_published_modules')}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_10%_-10%,hsl(var(--foreground)/0.08),transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(700px_420px_at_90%_-10%,hsl(var(--foreground)/0.06),transparent_60%)]" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(hsl(var(--foreground)/0.05)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--foreground)/0.05)_1px,transparent_1px)] [background-size:28px_28px]" />
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[280px_1fr]">
          {/* Course Rail */}
          <div className="sticky top-20 flex flex-col gap-6">
            <div className="rounded-2xl border border-border/60 bg-background/80 p-5 shadow-sm">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
                <BookOpenText className="h-3.5 w-3.5" />
                {t('share-course.badge')}
              </div>
              <h1 className="mt-3 font-semibold text-2xl text-foreground tracking-tight">
                {group.name}
              </h1>
              {group.description && (
                <p className="mt-2 text-foreground/60 text-sm leading-relaxed">
                  {group.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {t('share-course.published_modules', {
                    count: modules.length,
                  })}
                </Badge>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
              <div className="flex items-center justify-between border-border/40 border-b pb-3">
                <div className="font-semibold text-sm text-foreground/80">
                  {t('share-course.course_outline')}
                </div>
                <span className="text-foreground/50 text-xs">
                  {modules.length}
                </span>
              </div>
              <div className="mt-3 flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
                {modules.map((module, index) => (
                  <a
                    key={module.id}
                    href={`#module-${module.id}`}
                    onClick={() => {
                      setOpenModuleIds((prev) => new Set(prev).add(module.id));
                    }}
                    className="group flex items-start gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition hover:border-border/60 hover:bg-muted/40"
                  >
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground/70">
                      {index + 1}
                    </div>
                    <div className="flex-1 text-sm text-foreground/80">
                      <div className="font-medium text-foreground group-hover:text-foreground">
                        {module.name}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-foreground/50">
                        {module.quizzes > 0 && (
                          <span>{t('share-course.quiz_short')} {module.quizzes}</span>
                        )}
                        {module.quizSets > 0 && (
                          <span>{t('share-course.quiz_set_short')} {module.quizSets}</span>
                        )}
                        {module.flashcards > 0 && (
                          <span>{t('share-course.flashcard_short')} {module.flashcards}</span>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Modules List */}
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
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
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-4 py-2 text-xs font-semibold text-foreground/70 transition hover:bg-muted/60"
              >
                {anyOpen ? t('share-course.collapse_all') : t('share-course.expand_all')}
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 transition',
                    anyOpen && 'rotate-90'
                  )}
                />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {modules.map((module, index) => {
                const isOpen = openModuleIds.has(module.id);

                return (
                  <section
                    key={module.id}
                    id={`module-${module.id}`}
                    className="rounded-2xl border border-border/60 bg-background/80 shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => toggleModule(module.id)}
                      aria-expanded={isOpen}
                      aria-controls={`module-panel-${module.id}`}
                      className="flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left transition hover:bg-muted/40"
                    >
                      <div className="flex items-start gap-4">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted text-sm font-semibold text-foreground/70">
                          {index + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-lg text-foreground">
                            {module.name}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {module.quizzes > 0 && (
                              <Badge
                                aria-label={t('share-course.quiz_label')}
                                variant="outline"
                                className="h-5 rounded-sm border-foreground/10 px-1.5 text-[10px] text-foreground/60"
                              >
                                {t('share-course.quiz_short')} {module.quizzes}
                              </Badge>
                            )}
                            {module.quizSets > 0 && (
                              <Badge
                                aria-label={t('share-course.quiz_set_label')}
                                variant="outline"
                                className="h-5 rounded-sm border-foreground/10 px-1.5 text-[10px] text-foreground/60"
                              >
                                {t('share-course.quiz_set_short')} {module.quizSets}
                              </Badge>
                            )}
                            {module.flashcards > 0 && (
                              <Badge
                                aria-label={t('share-course.flashcard_label')}
                                variant="outline"
                                className="h-5 rounded-sm border-foreground/10 px-1.5 text-[10px] text-foreground/60"
                              >
                                {t('share-course.flashcard_short')} {module.flashcards}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight
                        className={cn(
                          'h-5 w-5 text-foreground/40 transition',
                          isOpen && 'rotate-90'
                        )}
                      />
                    </button>

                    {isOpen && (
                      <div
                        id={`module-panel-${module.id}`}
                        className="grid gap-5 border-border/40 border-t px-5 pb-6 pt-5"
                      >
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
                                {(module.youtube_links ?? []).map(
                                  (link: string) => (
                                    <YoutubeEmbed
                                      key={link}
                                      embedId={extractYoutubeId(link)}
                                    />
                                  )
                                )}
                              </div>
                            }
                          />
                        )}

                        {module.quizzes > 0 && (
                          <ModuleSection
                            title={t('ws-quizzes.plural')}
                            icon={<ListTodo className="h-4 w-4" />}
                            content={
                              <p className="text-foreground/60 text-sm">
                                {t('share-course.quiz_count', {
                                  count: module.quizzes,
                                })}
                              </p>
                            }
                          />
                        )}

                        {module.flashcards > 0 && (
                          <ModuleSection
                            title={t('ws-flashcards.plural')}
                            icon={<SwatchBook className="h-4 w-4" />}
                            content={
                              <p className="text-foreground/60 text-sm">
                                {t('share-course.flashcard_count', {
                                  count: module.flashcards,
                                })}
                              </p>
                            }
                          />
                        )}

                        {module.extra_content && (
                          <ModuleSection
                            title={t('course-details-tabs.extra_reading')}
                            icon={<BookText className="h-4 w-4" />}
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
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
