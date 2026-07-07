'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  X,
} from '@tuturuuu/icons';
import { updateWorkspaceCourseModule } from '@tuturuuu/internal-api/education';
import { listWorkspaceUserGroupStorageFiles } from '@tuturuuu/internal-api/storage';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { LessonSkeleton, SaveStatus, YoutubeRow } from './lesson-components';
import { LessonQuizSubmissionsSection } from './lesson-quiz-submissions-section';
import LessonQuizzesSection from './quizzes-section';
import { lessonQueryKey, useLessonDetail } from './use-lesson-detail';

type AttachFile = {
  contentType?: string | null;
  fullPath?: string | null;
  name: string;
  path: string;
  size?: number | null;
};

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
  const queryClient = useQueryClient();
  const t = useTranslations('teachModules.lesson');
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
  const skipNameBlurRef = useRef(false);
  // Attach dialog state
  const [showAttachDialog, setShowAttachDialog] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Record<string, boolean>>(
    {}
  );
  const [attachLoading, setAttachLoading] = useState(false);
  const attachFilesQuery = useQuery({
    enabled: showAttachDialog,
    queryFn: async () =>
      (await listWorkspaceUserGroupStorageFiles(
        wsId,
        courseId
      )) as AttachFile[],
    queryKey: ['teach-lesson-attach-files', wsId, courseId] as const,
  });

  // ─── Name editing ───────────────────────────────────────────────────────────

  const nameInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  function commitName() {
    skipNameBlurRef.current = false;
    const trimmed = (nameDraft ?? lesson?.name ?? '').trim();
    if (trimmed && trimmed !== lesson?.name) {
      saveName(trimmed);
    } else {
      setNameDraft(null);
    }
    setEditingName(false);
  }

  function cancelNameEdit() {
    setNameDraft(null);
    setEditingName(false);
  }

  function handleNameBlur() {
    if (skipNameBlurRef.current) {
      skipNameBlurRef.current = false;
      return;
    }
    commitName();
  }

  // ─── Content change ─────────────────────────────────────────────────────────

  function onContentChange(next: JSONContent | null) {
    queueContentSave(next);
  }

  // ─── YouTube links ──────────────────────────────────────────────────────────

  const youtubeLinkInputRef = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  const effectiveLinks: string[] = youtubeLinks ?? lesson?.youtube_links ?? [];

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
    const next = effectiveLinks.filter((_: string, i: number) => i !== index);
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

          {/* Attach files button */}
          <button
            className="inline-flex items-center gap-1.5 border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)] transition hover:-translate-y-0.5 hover:shadow-[3px_3px_0_var(--border)]"
            onClick={() => setShowAttachDialog(true)}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('attachFiles')}
          </button>

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
                onBlur={handleNameBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') {
                    skipNameBlurRef.current = true;
                    cancelNameEdit();
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
                onClick={cancelNameEdit}
                onPointerDown={() => {
                  skipNameBlurRef.current = true;
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
                  skipNameBlurRef.current = false;
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

        {/* ── Attach files dialog (modal) ────────────────────────────────────── */}
        <Dialog
          open={showAttachDialog}
          onOpenChange={(open) => {
            setShowAttachDialog(open);
            if (!open) setSelectedPaths({});
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{t('attachFiles')}</DialogTitle>
              <DialogDescription>
                {t('attachFilesDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-72 overflow-auto border-2 border-border bg-card p-2">
              {attachFilesQuery.isLoading && (
                <div className="p-4 text-muted-foreground text-sm">
                  {t('loadingFiles')}
                </div>
              )}
              {attachFilesQuery.isError && (
                <div className="p-4 text-muted-foreground text-sm">
                  {t('loadFilesError')}
                </div>
              )}
              {attachFilesQuery.data?.length === 0 && (
                <div className="p-4 text-muted-foreground text-sm">
                  {t('noFilesFound')}
                </div>
              )}
              {attachFilesQuery.data?.map((file) => (
                <label
                  key={file.fullPath ?? file.path}
                  className="flex items-center gap-2 p-2"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selectedPaths[file.path])}
                    onChange={() =>
                      setSelectedPaths((selected) => ({
                        ...selected,
                        [file.path]: !selected[file.path],
                      }))
                    }
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-medium">{file.name}</div>
                    <div className="truncate text-muted-foreground text-xs">
                      {file.path}
                    </div>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {file.size ?? ''}
                  </div>
                </label>
              ))}
            </div>

            <DialogFooter>
              <button
                className="border-2 border-border bg-card px-3 py-1.5 font-bold text-sm shadow-[2px_2px_0_var(--border)]"
                onClick={() => setShowAttachDialog(false)}
                type="button"
              >
                {t('cancel')}
              </button>
              <button
                className="border-2 border-border bg-primary px-3 py-1.5 font-bold text-primary-foreground text-sm shadow-[2px_2px_0_var(--border)] disabled:opacity-40"
                disabled={attachLoading}
                onClick={async () => {
                  const paths = Object.keys(selectedPaths).filter(
                    (path) => selectedPaths[path]
                  );
                  if (paths.length === 0) {
                    return toast.error(t('selectAtLeastOneFile'));
                  }

                  setAttachLoading(true);
                  try {
                    const picked = (attachFilesQuery.data ?? [])
                      .filter((file) => paths.includes(file.path))
                      .map((file) => ({
                        contentType: file.contentType ?? null,
                        fullPath: file.fullPath ?? null,
                        name: file.name,
                        path: file.path,
                        size: file.size ?? null,
                      }));

                    const existing =
                      (lesson as any)?.extra_content?.attachments ?? [];
                    const merged = Array.from(
                      new Map(
                        [...existing, ...picked].map((file) => [
                          file.fullPath ?? file.path,
                          file,
                        ])
                      ).values()
                    );
                    const nextExtraContent = {
                      ...(lesson as any)?.extra_content,
                      attachments: merged,
                    };

                    await updateWorkspaceCourseModule(wsId, lessonId, {
                      extra_content: nextExtraContent,
                    });
                    queryClient.setQueryData(
                      lessonQueryKey(wsId, courseId),
                      (modules: any[] | undefined) =>
                        modules?.map((module) =>
                          module.id === lessonId
                            ? {
                                ...module,
                                extra_content: nextExtraContent,
                              }
                            : module
                        )
                    );

                    toast.success(t('filesAttached'));
                    setShowAttachDialog(false);
                  } catch (err) {
                    toast.error(t('attachFailed'));
                    void err;
                  } finally {
                    setAttachLoading(false);
                  }
                }}
                type="button"
              >
                {t('attachSelected')}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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

        <LessonQuizzesSection wsId={wsId} lessonId={lessonId} />
        <LessonQuizSubmissionsSection
          courseId={courseId}
          moduleId={lessonId}
          wsId={wsId}
        />
      </div>
    </main>
  );
}
