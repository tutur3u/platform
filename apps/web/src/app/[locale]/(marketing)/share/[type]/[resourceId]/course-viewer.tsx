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
import type { WorkspaceCourseModule } from '@tuturuuu/types';
import type { JSONContent } from '@tuturuuu/types/tiptap';

import { Badge } from '@tuturuuu/ui/badge';

import { YoutubeEmbed } from '@tuturuuu/ui/custom/education/modules/youtube/embed';

import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import { extractYoutubeId } from '@/utils/url-helper';

interface CourseViewerProps {
  group: { name?: string; description?: string | null };
  modules: (WorkspaceCourseModule & {
    quizzes: number;
    flashcards: number;
    quizSets: number;
  })[];
}

function ModuleSection({ title, icon, content, rawContent, t }: any) {
  const isContentEmpty =
    rawContent
      ? !rawContent.content?.some(
          (node: any) =>
            node.type !== 'paragraph' ||
            (node.content && node.content.length > 0)
        )
      : !content;

  if (isContentEmpty) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-foreground/10 bg-foreground/5 p-4">
      <div className="flex items-center gap-2 font-semibold text-lg">
        {icon}
        {title}
      </div>
      <div className="text-foreground/90 overflow-hidden">
        {content || rawContent}
      </div>
    </div>
  );
}

export function CourseViewer({ group, modules }: CourseViewerProps) {
  const t = useTranslations();
  const [selectedModuleId, setSelectedModuleId] = useQueryState('module');

  // Default to first module if none selected or invalid
  const selectedModule =
    modules.find((m) => m.id === selectedModuleId) || modules[0];

  // Update URL on initial load if no module is selected but we have modules
  // We don't necessarily have to, but it makes the state explicit

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
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-[320px_1fr] lg:grid-cols-[380px_1fr]">
        {/* Sidebar */}
        <div className="sticky top-24 flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-sm">
          {/* Header Info */}
          <div className="flex flex-col gap-3 border-border/40 border-b bg-muted/30 p-6">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-dynamic-blue/20 bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
              <BookOpenText className="h-3.5 w-3.5" />
              {t('share-course.badge')}
            </div>
            <h1 className="font-bold text-2xl text-foreground tracking-tight">
              {group.name}
            </h1>
            {group.description && (
              <p className="text-foreground/65 text-sm leading-relaxed">
                {group.description}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant="secondary">
                {modules.length} {t('share-course.published_modules')}
              </Badge>
            </div>
          </div>

          {/* Module List */}
          <div className="flex max-h-[60vh] flex-col overflow-y-auto p-3">
            {modules.map((module, index) => {
              const isActive = selectedModule?.id === module.id;

              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setSelectedModuleId(module.id)}
                  className={cn(
                    'flex flex-col gap-2 rounded-xl border border-transparent p-3 text-left transition-all hover:bg-muted/50',
                    isActive && 'border-border/60 bg-muted/50 shadow-sm'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-semibold text-xs transition-colors',
                        isActive
                          ? 'bg-dynamic-blue text-white'
                          : 'bg-dynamic-blue/10 text-dynamic-blue'
                      )}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 font-medium text-foreground text-sm">
                      {module.name}
                    </div>
                    {isActive && (
                      <ChevronRight className="h-4 w-4 text-foreground/40" />
                    )}
                  </div>

                  {/* Indicators */}
                  <div className="ml-9 flex items-center gap-1.5">
                    {module.quizzes > 0 && (
                      <Badge
                        variant="outline"
                        className="h-4 rounded-sm border-foreground/10 px-1 text-[10px] text-foreground/60"
                      >
                        Q {module.quizzes}
                      </Badge>
                    )}
                    {module.quizSets > 0 && (
                      <Badge
                        variant="outline"
                        className="h-4 rounded-sm border-foreground/10 px-1 text-[10px] text-foreground/60"
                      >
                        S {module.quizSets}
                      </Badge>
                    )}
                    {module.flashcards > 0 && (
                      <Badge
                        variant="outline"
                        className="h-4 rounded-sm border-foreground/10 px-1 text-[10px] text-foreground/60"
                      >
                        F {module.flashcards}
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="min-h-[50vh] rounded-2xl border border-border/60 bg-background p-6 shadow-sm lg:p-8">
          {selectedModule ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2 border-border/40 border-b pb-4">
                <h2 className="font-bold text-3xl text-foreground tracking-tight">
                  {selectedModule.name}
                </h2>
              </div>

              <div className="grid gap-6">
                {/* Content */}
                {selectedModule.content && (
                  <ModuleSection
                    t={t}
                    title={t('course-details-tabs.module_content')}
                    icon={<Goal className="h-5 w-5" />}
                    rawContent={selectedModule.content}
                    content={
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <RichTextEditor
                          content={selectedModule.content as JSONContent}
                          readOnly
                        />
                      </div>
                    }
                  />
                )}

                {/* YouTube links */}
                {(selectedModule.youtube_links ?? []).length > 0 && (
                  <ModuleSection
                    t={t}
                    title={t('course-details-tabs.youtube_links')}
                    icon={<Youtube className="h-5 w-5" />}
                    content={
                      <div className="grid gap-4">
                        {(selectedModule.youtube_links ?? []).map(
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

                {/* Quizzes indicator */}
                {selectedModule.quizzes > 0 && (
                  <ModuleSection
                    t={t}
                    title={t('ws-quizzes.plural')}
                    icon={<ListTodo className="h-5 w-5" />}
                    content={
                      <p className="text-foreground/60 text-sm">
                        {t('share-course.quiz_count', {
                          count: selectedModule.quizzes,
                        })}
                      </p>
                    }
                  />
                )}

                {/* Flashcards indicator */}
                {selectedModule.flashcards > 0 && (
                  <ModuleSection
                    t={t}
                    title={t('ws-flashcards.plural')}
                    icon={<SwatchBook className="h-5 w-5" />}
                    content={
                      <p className="text-foreground/60 text-sm">
                        {t('share-course.flashcard_count', {
                          count: selectedModule.flashcards,
                        })}
                      </p>
                    }
                  />
                )}

                {/* Extra reading indicator */}
                {selectedModule.extra_content && (
                  <ModuleSection
                    t={t}
                    title={t('course-details-tabs.extra_reading')}
                    icon={<BookText className="h-5 w-5" />}
                    content={
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <RichTextEditor
                          content={selectedModule.extra_content as JSONContent}
                          readOnly
                        />
                      </div>
                    }
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-foreground/50">
              <BookOpenText className="mb-4 h-12 w-12 opacity-20" />
              <p>Select a module to view its content</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
