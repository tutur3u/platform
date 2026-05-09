'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  BookText,
  ChevronLeft,
  ChevronRight,
  Layers,
  Youtube,
} from '@tuturuuu/icons';
import {
  getSharedCourseContent,
  type SharedCourseContentResponse,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BrutalCard, EmptyState, LoadingState } from './shared';

type CourseModule = SharedCourseContentResponse['modules'][number];

export function CourseDetailPage({
  wsId,
  courseId,
}: {
  wsId: string;
  courseId: string;
}) {
  const t = useTranslations();
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const course = useQuery({
    queryFn: () => getSharedCourseContent(courseId),
    queryKey: ['course-detail', courseId],
  });

  if (course.isLoading) return <LoadingState />;
  if (!course.data) return <EmptyState label={t('courses.empty')} />;

  const { group, modules } = course.data;
  const selectedModule = modules.find((m) => m.id === selectedModuleId) ?? null;
  const selectedIndex = selectedModule ? modules.indexOf(selectedModule) : -1;
  const previousModule = selectedIndex > 0 ? modules[selectedIndex - 1] : null;
  const nextModule =
    selectedIndex >= 0 && selectedIndex < modules.length - 1
      ? modules[selectedIndex + 1]
      : null;

  // If a module is selected, show the module detail view
  if (selectedModule) {
    return (
      <ModuleDetailView
        group={group}
        module={selectedModule}
        moduleIndex={selectedIndex}
        totalModules={modules.length}
        previousModule={previousModule ?? undefined}
        nextModule={nextModule ?? undefined}
        onBack={() => setSelectedModuleId(null)}
        onNavigate={(id) => setSelectedModuleId(id)}
      />
    );
  }

  // Course overview with module list
  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <Link
        href={`/${wsId}/courses`}
        className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
      >
        <ChevronLeft className="h-4 w-4" />
        {t('common.back')}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Left sidebar - Course info */}
        <aside className="space-y-4">
          {/* Course card */}
          <BrutalCard className="p-5">
            <Badge className="mb-3 border-2 border-border bg-dynamic-yellow/15 font-bold text-foreground shadow-[2px_2px_0_var(--border)]">
              <BookOpen className="mr-1.5 h-3 w-3" />
              Shared Course
            </Badge>
            <h2 className="font-black text-xl leading-tight">
              {group.name ?? t('courses.untitled')}
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {modules.length} published module{modules.length !== 1 ? 's' : ''}
            </p>
          </BrutalCard>

          {/* Course outline */}
          <BrutalCard className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Course outline</h3>
              <span className="text-muted-foreground text-xs">
                {modules.length}
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              {modules.map((module, index) => (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setSelectedModuleId(module.id)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition hover:bg-muted/60"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-border bg-muted font-bold text-[10px]">
                    {index + 1}
                  </span>
                  <span className="truncate">
                    {module.name ?? t('courses.untitled')}
                  </span>
                </button>
              ))}
            </div>
          </BrutalCard>
        </aside>

        {/* Main content - Module list */}
        <div className="space-y-5">
          <div>
            <p className="font-bold text-muted-foreground text-xs uppercase tracking-widest">
              Modules
            </p>
            <h1 className="mt-1 font-black text-3xl leading-tight tracking-normal">
              {group.name ?? t('courses.untitled')}
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Select a module to view its content
            </p>
          </div>

          {/* Module rows */}
          <div className="space-y-3">
            {modules.map((module, index) => (
              <BrutalCard key={module.id} className="p-0">
                <button
                  type="button"
                  onClick={() => setSelectedModuleId(module.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-primary font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)]">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold text-base">
                      {module.name ?? t('courses.untitled')}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-3 text-muted-foreground text-xs">
                      {module.quizzes > 0 && (
                        <span>{module.quizzes} quizzes</span>
                      )}
                      {module.flashcards > 0 && (
                        <span>{module.flashcards} flashcards</span>
                      )}
                      {(module.youtube_links ?? []).length > 0 && (
                        <span className="flex items-center gap-1">
                          <Youtube className="h-3 w-3" />
                          {(module.youtube_links ?? []).length} video
                          {(module.youtube_links ?? []).length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 font-bold text-muted-foreground text-sm transition group-hover:text-foreground">
                    Open module
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </button>
              </BrutalCard>
            ))}
          </div>

          {!modules.length ? <EmptyState label={t('courses.empty')} /> : null}
        </div>
      </div>
    </div>
  );
}

// ─── Module Detail View ──────────────────────────────────────────────────────

function ModuleDetailView({
  group,
  module,
  moduleIndex,
  totalModules,
  previousModule,
  nextModule,
  onBack,
  onNavigate,
}: {
  group: SharedCourseContentResponse['group'];
  module: CourseModule;
  moduleIndex: number;
  totalModules: number;
  previousModule?: CourseModule;
  nextModule?: CourseModule;
  onBack: () => void;
  onNavigate: (id: string) => void;
}) {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 border-2 border-border bg-background px-3 py-1.5 font-bold shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to modules
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="font-semibold text-muted-foreground">
          {group.name}
        </span>
      </div>

      {/* Module header card */}
      <BrutalCard className="p-6">
        <Badge className="mb-3 border-2 border-border bg-dynamic-cyan/15 font-bold text-foreground shadow-[2px_2px_0_var(--border)]">
          <Layers className="mr-1.5 h-3 w-3" />
          Module {moduleIndex + 1} of {totalModules}
        </Badge>
        <h1 className="font-black text-3xl leading-tight tracking-normal">
          {module.name ?? t('courses.untitled')}
        </h1>
        {group.description && (
          <p className="mt-2 text-muted-foreground leading-relaxed">
            {group.description}
          </p>
        )}
      </BrutalCard>

      {/* Content + Sidebar */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/* Main content */}
        <div className="space-y-5">
          {/* Module content */}
          {hasContent(module.content) && (
            <ContentCard
              icon={<BookOpen className="h-4 w-4" />}
              title="Module Content"
            >
              <RichContentRenderer content={module.content} />
            </ContentCard>
          )}

          {/* YouTube videos */}
          {(module.youtube_links ?? []).length > 0 && (
            <ContentCard icon={<Youtube className="h-4 w-4" />} title="Videos">
              <div className="grid gap-3">
                {(module.youtube_links ?? []).map((link) => (
                  <YoutubeCard key={link} url={link} />
                ))}
              </div>
            </ContentCard>
          )}

          {/* Extra content */}
          {hasContent(module.extra_content) && (
            <ContentCard
              icon={<BookText className="h-4 w-4" />}
              title="Extra Reading"
            >
              <RichContentRenderer content={module.extra_content} />
            </ContentCard>
          )}

          {/* Empty state if no content */}
          {!hasContent(module.content) &&
            !(module.youtube_links ?? []).length &&
            !hasContent(module.extra_content) && (
              <EmptyState label="This module has no content yet." />
            )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Module status */}
          <BrutalCard className="p-4">
            <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
              Module Status
            </p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Quizzes</span>
                <span className="font-bold">{module.quizzes}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Quiz Sets</span>
                <span className="font-bold">{module.quizSets}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Flashcards</span>
                <span className="font-bold">{module.flashcards}</span>
              </div>
            </div>
          </BrutalCard>

          {/* Module navigation */}
          <BrutalCard className="p-4">
            <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
              Module Navigation
            </p>
            <div className="mt-3 space-y-2">
              {previousModule && (
                <button
                  type="button"
                  onClick={() => onNavigate(previousModule.id)}
                  className="flex w-full items-center justify-between border-2 border-border bg-background px-3 py-2 text-sm transition hover:bg-muted/40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="truncate">Previous</span>
                </button>
              )}
              {nextModule && (
                <button
                  type="button"
                  onClick={() => onNavigate(nextModule.id)}
                  className="flex w-full items-center justify-between border-2 border-border bg-background px-3 py-2 text-sm transition hover:bg-muted/40"
                >
                  <span className="truncate">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </BrutalCard>

          {/* Hint card */}
          <div className="border-2 border-dynamic-green/30 bg-dynamic-green/10 p-4 text-dynamic-green text-sm leading-relaxed shadow-[3px_3px_0_hsl(var(--dynamic-green)/0.2)]">
            Work through the content, then return to pick another module.
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Content Card ────────────────────────────────────────────────────────────

function ContentCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <BrutalCard className="p-5">
      <div className="mb-4 flex items-center gap-2 font-bold text-sm">
        <span className="text-muted-foreground">{icon}</span>
        <span>{title}</span>
      </div>
      <div>{children}</div>
    </BrutalCard>
  );
}

// ─── Rich Text Renderer (simplified TipTap JSON → HTML) ─────────────────────

interface TipTapNode {
  type?: string;
  text?: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

function hasContent(content: unknown): boolean {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return false;
  }
  const doc = content as TipTapNode;
  return (doc.content ?? []).some(
    (node) => node.type !== 'paragraph' || (node.content?.length ?? 0) > 0
  );
}

function RichContentRenderer({ content }: { content: unknown }) {
  if (!content || typeof content !== 'object') return null;
  const doc = content as TipTapNode;
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 leading-relaxed">
      {(doc.content ?? []).map((node, i) => (
        <RenderNode key={i} node={node} />
      ))}
    </div>
  );
}

function RenderNode({ node }: { node: TipTapNode }) {
  if (node.type === 'text') {
    let element: React.ReactNode = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') element = <strong>{element}</strong>;
      if (mark.type === 'italic') element = <em>{element}</em>;
      if (mark.type === 'code')
        element = (
          <code className="border border-border bg-muted px-1 py-0.5 text-xs">
            {element}
          </code>
        );
      if (mark.type === 'link') {
        const href = (mark.attrs?.href as string) ?? '#';
        element = (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            {element}
          </a>
        );
      }
    }
    return <>{element}</>;
  }

  const children = (node.content ?? []).map((child, i) => (
    <RenderNode key={i} node={child} />
  ));

  switch (node.type) {
    case 'paragraph':
      return <p className="mb-3 last:mb-0">{children}</p>;
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 2;
      if (level === 1)
        return <h1 className="mb-3 font-black text-2xl">{children}</h1>;
      if (level === 2)
        return <h2 className="mb-2 font-bold text-xl">{children}</h2>;
      return <h3 className="mb-2 font-bold text-lg">{children}</h3>;
    }
    case 'bulletList':
      return <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>;
    case 'orderedList':
      return <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>;
    case 'listItem':
      return <li>{children}</li>;
    case 'blockquote':
      return (
        <blockquote className="mb-3 border-border border-l-4 pl-4 text-muted-foreground italic">
          {children}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre className="mb-3 overflow-x-auto border-2 border-border bg-muted p-4 text-sm">
          <code>{children}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr className="my-4 border-border" />;
    case 'hardBreak':
      return <br />;
    default:
      return <>{children}</>;
  }
}

// ─── YouTube Card ────────────────────────────────────────────────────────────

function extractYoutubeId(url: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') {
      return parsed.pathname.slice(1) || undefined;
    }
    if (
      parsed.hostname.includes('youtube.com') ||
      parsed.hostname.includes('youtube-nocookie.com')
    ) {
      const v = parsed.searchParams.get('v');
      if (v) return v;
      const pathMatch = parsed.pathname.match(/\/(embed|v|shorts)\/([^/?]+)/);
      if (pathMatch?.[2]) return pathMatch[2];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function YoutubeCard({ url }: { url: string }) {
  const videoId = extractYoutubeId(url);

  if (!videoId) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 border-2 border-border bg-muted/40 px-4 py-3 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5"
      >
        <Youtube className="h-4 w-4 shrink-0 text-red-500" />
        <span className="truncate">{url}</span>
      </a>
    );
  }

  return (
    <div className="overflow-hidden border-2 border-border shadow-[3px_3px_0_var(--border)]">
      <div className="relative aspect-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
}
