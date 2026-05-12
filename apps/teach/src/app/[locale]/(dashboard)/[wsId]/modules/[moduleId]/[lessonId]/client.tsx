'use client';

import {
  ArrowLeft,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  Youtube,
} from '@tuturuuu/icons';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useLessonDetail } from './use-lesson-detail';

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LessonSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-5 md:px-8">
      <div className="h-10 w-48 animate-pulse border-2 border-border bg-card shadow-[2px_2px_0_var(--border)]" />
      <div className="space-y-4 border-2 border-border bg-background p-6 shadow-[8px_8px_0_var(--border)]">
        <div className="h-8 w-3/4 animate-pulse bg-muted" />
        <div className="h-4 w-1/2 animate-pulse bg-muted" />
        <div className="mt-6 h-64 animate-pulse bg-muted/60" />
      </div>
    </div>
  );
}

// ─── YouTube link row ─────────────────────────────────────────────────────────

function YoutubeRow({ url, onRemove }: { url: string; onRemove: () => void }) {
  const videoId = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/
  )?.[1];

  return (
    <div className="group/yt flex items-center gap-2 border-2 border-border bg-card px-3 py-2 shadow-[2px_2px_0_var(--border)]">
      <Youtube className="h-4 w-4 shrink-0 text-dynamic-red" />
      {videoId ? (
        <a
          className="min-w-0 flex-1 truncate text-sm hover:underline"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {url}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
          {url}
        </span>
      )}
      <button
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/yt:opacity-100"
        onClick={onRemove}
        type="button"
        aria-label="Remove YouTube link"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Save status indicator ────────────────────────────────────────────────────

function SaveStatus({ isSaving }: { isSaving: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs transition-opacity',
        isSaving ? 'text-muted-foreground' : 'text-dynamic-green'
      )}
    >
      {isSaving ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </>
      ) : (
        <>
          <Check className="h-3 w-3" />
          Saved
        </>
      )}
    </span>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function LessonDetailClient({
  courseId,
  lessonId,
  wsId,
  workspaceName,
}: {
  courseId: string;
  lessonId: string;
  wsId: string;
  workspaceName: string | null;
}) {
  const {
    lesson,
    isLoading,
    isError,
    isSaving,
    queueContentSave,
    saveName,
    saveYoutubeLinks,
    savePublished,
  } = useLessonDetail(wsId, courseId, lessonId);

  // ─── Local state ────────────────────────────────────────────────────────────

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [youtubeLinks, setYoutubeLinks] = useState<string[] | null>(null);
  const [addingYoutube, setAddingYoutube] = useState(false);
  const [youtubeDraft, setYoutubeDraft] = useState('');

  // ─── Name editing ───────────────────────────────────────────────────────────

  const nameInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  function commitName() {
    const trimmed = (nameDraft ?? lesson?.name ?? '').trim();
    if (trimmed && trimmed !== lesson?.name) {
      saveName(trimmed);
    } else {
      setNameDraft(null);
    }
    setEditingName(false);
  }

  // ─── Content change ─────────────────────────────────────────────────────────

  function onContentChange(next: JSONContent | null) {
    queueContentSave(next);
  }

  // ─── YouTube links ──────────────────────────────────────────────────────────

  const youtubeLinkInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  const effectiveLinks = youtubeLinks ?? lesson?.youtube_links ?? [];

  function commitYoutubeLink() {
    const trimmed = youtubeDraft.trim();
    if (!trimmed) return;
    const next = [...effectiveLinks, trimmed];
    setYoutubeLinks(next);
    saveYoutubeLinks(next);
    setYoutubeDraft('');
    setAddingYoutube(false);
  }

  function removeYoutubeLink(index: number) {
    const next = effectiveLinks.filter((_, i) => i !== index);
    setYoutubeLinks(next);
    saveYoutubeLinks(next);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <LessonSkeleton />;

  if (isError || !lesson) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-root-background px-5">
        <div className="border-2 border-border border-dashed bg-muted/60 p-10 text-center shadow-[8px_8px_0_var(--border)]">
          <p className="text-muted-foreground">
            {isError ? 'Failed to load lesson.' : 'Lesson not found.'}
          </p>
          <Link
            className="mt-4 inline-flex items-center gap-2 border-2 border-border bg-background px-4 py-2 font-bold text-sm shadow-[3px_3px_0_var(--border)]"
            href={`/${wsId}/modules/${courseId}`}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to modules
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-root-background text-foreground">
      {/* ── Top nav bar ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-10 flex items-center gap-3 border-border border-b-2 bg-background px-5 py-2.5 shadow-[0_2px_0_var(--border)]">
        <Link
          className="inline-flex items-center gap-2 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
          href={`/${wsId}/modules/${courseId}`}
        >
          <ArrowLeft className="h-4 w-4" />
          Modules
        </Link>

        <span className="hidden text-muted-foreground text-sm md:block">
          {workspaceName ?? 'Workspace'}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <SaveStatus isSaving={isSaving} />

          {/* Published toggle */}
          <button
            className={cn(
              'inline-flex items-center gap-1.5 border-2 border-border px-3 py-1.5 font-bold text-xs shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5',
              lesson.is_published
                ? 'bg-dynamic-green/15 text-foreground'
                : 'bg-muted text-muted-foreground'
            )}
            onClick={() => savePublished(!lesson.is_published)}
            type="button"
          >
            {lesson.is_published ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                Published
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                Draft
              </>
            )}
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-5 py-6 md:px-8">
        {/* ── Lesson title ──────────────────────────────────────────────────── */}
        <div className="mb-6 flex items-start gap-3">
          <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center border-2 border-border bg-dynamic-cyan/15 shadow-[2px_2px_0_var(--border)]">
            <BookOpen className="h-4 w-4" />
          </span>

          {editingName ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                ref={nameInputRef}
                className="min-w-0 flex-1 border-primary border-b-2 bg-transparent font-black text-2xl outline-none md:text-3xl"
                value={nameDraft ?? lesson.name ?? ''}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') {
                    setNameDraft(null);
                    setEditingName(false);
                  }
                }}
              />
              <button
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={commitName}
                type="button"
                aria-label="Confirm name"
              >
                <Check className="h-5 w-5" />
              </button>
              <button
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setNameDraft(null);
                  setEditingName(false);
                }}
                type="button"
                aria-label="Cancel rename"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="group/title flex min-w-0 flex-1 items-center gap-2">
              <h1 className="min-w-0 flex-1 font-black text-2xl leading-tight md:text-3xl">
                {lesson.name ?? 'Untitled lesson'}
              </h1>
              <button
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/title:opacity-100"
                onClick={() => {
                  setNameDraft(lesson.name ?? '');
                  setEditingName(true);
                }}
                type="button"
                aria-label="Rename lesson"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* ── Rich text editor — keyed on lessonId so it remounts with fresh
             content when navigating between lessons. Only rendered once lesson
             data is available so the editor initialises with real content. ── */}
        <div className="border-2 border-border bg-background shadow-[5px_5px_0_var(--border)]">
          <RichTextEditor
            key={lessonId}
            content={(lesson.content as JSONContent | null) ?? null}
            onChange={onContentChange}
            titlePlaceholder="Lesson title…"
            writePlaceholder="Write lesson content…"
            saveButtonLabel="Save"
            savedButtonLabel="Saved"
          />
        </div>

        {/* ── YouTube links ─────────────────────────────────────────────────── */}
        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-black text-lg">YouTube Videos</h2>
            <button
              className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
              onClick={() => setAddingYoutube(true)}
              type="button"
            >
              <Plus className="h-3.5 w-3.5" />
              Add video
            </button>
          </div>

          {effectiveLinks.map((url, i) => (
            <YoutubeRow
              key={`${url}-${i}`}
              url={url}
              onRemove={() => removeYoutubeLink(i)}
            />
          ))}

          {effectiveLinks.length === 0 && !addingYoutube && (
            <p className="text-muted-foreground text-sm">
              No videos attached yet.
            </p>
          )}

          {addingYoutube && (
            <div className="flex items-center gap-2">
              <input
                ref={youtubeLinkInputRef}
                className="min-w-0 flex-1 border-2 border-border bg-background px-3 py-1.5 text-sm shadow-[2px_2px_0_var(--border)] outline-none focus:border-primary"
                placeholder="https://youtube.com/watch?v=…"
                value={youtubeDraft}
                onChange={(e) => setYoutubeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitYoutubeLink();
                  if (e.key === 'Escape') {
                    setYoutubeDraft('');
                    setAddingYoutube(false);
                  }
                }}
              />
              <button
                className="shrink-0 border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
                disabled={!youtubeDraft.trim()}
                onClick={commitYoutubeLink}
                type="button"
              >
                Add
              </button>
              <button
                className="shrink-0 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
                onClick={() => {
                  setYoutubeDraft('');
                  setAddingYoutube(false);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
