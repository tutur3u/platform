'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  BookText,
  ChevronLeft,
  ChevronRight,
  FileQuestion,
  Layers,
  Play,
  Youtube,
  Zap,
} from '@tuturuuu/icons';
import {
  getSharedCourseContent,
  type SharedCourseContentResponse,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  BrutalCard,
  EmptyState,
  LoadingState,
  Section,
  courseThemes,
  usePageMotion,
} from './shared';

export function CourseDetailPage({
  wsId,
  courseId,
}: {
  wsId: string;
  courseId: string;
}) {
  const t = useTranslations();
  const scopeRef = usePageMotion();
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  const course = useQuery({
    queryFn: () => getSharedCourseContent(courseId),
    queryKey: ['course-detail', courseId],
  });

  if (course.isLoading) return <LoadingState />;
  if (!course.data) return <EmptyState label={t('courses.empty')} />;

  const { group, modules } = course.data;

  return (
    <div className="space-y-6" ref={scopeRef}>
      {/* Back navigation */}
      <Link
        href={`/${wsId}/courses`}
        className="inline-flex items-center gap-2 border-2 border-border bg-background px-3 py-1.5 font-bold text-sm shadow-[3px_3px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0_var(--border)]"
        data-learn-reveal
      >
        <ChevronLeft className="h-4 w-4" />
        {t('common.back')}
      </Link>

      {/* Course header */}
      <Section
        title={group.name ?? t('courses.untitled')}
        description={group.description ?? undefined}
        refValue={scopeRef}
      >
        {/* Module count summary */}
        <div
          className="flex flex-wrap gap-3"
          data-learn-reveal
        >
          <StatBadge icon={Layers} label={`${modules.length} modules`} />
          <StatBadge
            icon={FileQuestion}
            label={`${modules.reduce((s, m) => s + m.quizzes, 0)} quizzes`}
          />
          <StatBadge
            icon={Zap}
            label={`${modules.reduce((s, m) => s + m.flashcards, 0)} flashcards`}
          />
        </div>

        {/* Modules list */}
        <div className="space-y-4">
          {modules.map((module, index) => (
            <ModuleCard
              key={module.id}
              module={module}
              index={index}
              isExpanded={expandedModule === module.id}
              onToggle={() =>
                setExpandedModule(
                  expandedModule === module.id ? null : module.id
                )
              }
            />
          ))}
        </div>

        {!modules.length ? (
          <EmptyState label={t('courses.empty')} />
        ) : null}
      </Section>
    </div>
  );
}


// ─── Module Card ─────────────────────────────────────────────────────────────

type CourseModule = SharedCourseContentResponse['modules'][number];

function ModuleCard({
  module,
  index,
  isExpanded,
  onToggle,
}: {
  module: CourseModule;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations();
  const theme = courseThemes[index % courseThemes.length] ?? courseThemes[0];
  const Icon = theme.icon;

  return (
    <BrutalCard className="overflow-hidden p-0" reveal>
      {/* Module header - clickable to expand */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-4 border-b-2 border-border px-5 py-4 text-left transition',
          isExpanded ? theme.surface : 'hover:bg-muted/30'
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-background font-bold text-sm shadow-[2px_2px_0_var(--border)]">
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
            {module.quizSets > 0 && (
              <span>{module.quizSets} quiz sets</span>
            )}
            {(module.youtube_links ?? []).length > 0 && (
              <span className="flex items-center gap-1">
                <Youtube className="h-3 w-3" />
                {(module.youtube_links ?? []).length}
              </span>
            )}
          </div>
        </div>
        <ChevronRight
          className={cn(
            'h-5 w-5 shrink-0 text-muted-foreground transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="space-y-5 p-5">
          {/* Rich text content */}
          {module.content && hasContent(module.content) && (
            <ContentSection
              icon={<BookOpen className="h-4 w-4" />}
              title="Content"
            >
              <RichContentRenderer content={module.content} />
            </ContentSection>
          )}

          {/* YouTube links */}
          {(module.youtube_links ?? []).length > 0 && (
            <ContentSection
              icon={<Youtube className="h-4 w-4" />}
              title="Videos"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {(module.youtube_links ?? []).map((link) => (
                  <YoutubeCard key={link} url={link} />
                ))}
              </div>
            </ContentSection>
          )}

          {/* Extra content */}
          {module.extra_content && hasContent(module.extra_content) && (
            <ContentSection
              icon={<BookText className="h-4 w-4" />}
              title="Extra reading"
            >
              <RichContentRenderer content={module.extra_content} />
            </ContentSection>
          )}

          {/* Stats footer */}
          <div className="flex flex-wrap gap-2 border-t-2 border-border pt-4">
            {module.quizzes > 0 && (
              <Badge
                variant="secondary"
                className="border-2 border-border shadow-[2px_2px_0_var(--border)]"
              >
                {module.quizzes} Quizzes
              </Badge>
            )}
            {module.flashcards > 0 && (
              <Badge
                variant="secondary"
                className="border-2 border-border shadow-[2px_2px_0_var(--border)]"
              >
                {module.flashcards} Flashcards
              </Badge>
            )}
            {module.quizSets > 0 && (
              <Badge
                variant="secondary"
                className="border-2 border-border shadow-[2px_2px_0_var(--border)]"
              >
                {module.quizSets} Quiz Sets
              </Badge>
            )}
          </div>
        </div>
      )}
    </BrutalCard>
  );
}

// ─── Content Helpers ─────────────────────────────────────────────────────────

function ContentSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-bold text-sm text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      <div className="border-2 border-border bg-background p-4 shadow-[3px_3px_0_var(--border)]">
        {children}
      </div>
    </div>
  );
}

function StatBadge({
  icon: Icon,
  label,
}: {
  icon: typeof BookOpen;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 border-2 border-border bg-muted/40 px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{label}</span>
    </div>
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
    (node) =>
      node.type !== 'paragraph' || (node.content?.length ?? 0) > 0
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
      if (mark.type === 'code') element = <code>{element}</code>;
      if (mark.type === 'link') {
        const href = (mark.attrs?.href as string) ?? '#';
        element = (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
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
      return <p>{children}</p>;
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 2;
      const Tag = `h${level}` as keyof JSX.IntrinsicElements;
      return <Tag>{children}</Tag>;
    }
    case 'bulletList':
      return <ul>{children}</ul>;
    case 'orderedList':
      return <ol>{children}</ol>;
    case 'listItem':
      return <li>{children}</li>;
    case 'blockquote':
      return <blockquote>{children}</blockquote>;
    case 'codeBlock':
      return (
        <pre className="overflow-x-auto border-2 border-border bg-muted p-3 text-sm">
          <code>{children}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr />;
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
      const pathMatch = parsed.pathname.match(
        /\/(embed|v|shorts)\/([^/?]+)/
      );
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
