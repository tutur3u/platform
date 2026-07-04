'use client';

import { useMutation } from '@tanstack/react-query';
import { updateWorkspaceCourseModule } from '@tuturuuu/internal-api';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { toast } from '@tuturuuu/ui/sonner';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';

const CONTENT_SAVE_DEBOUNCE_MS = 500;

interface ModuleContentEditorProps {
  content?: JSONContent | null;
  courseId: string;
  moduleId: string;
  wsId: string;
}

function isSameContent(
  left: JSONContent | null | undefined,
  right: JSONContent | null | undefined
) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function ModuleContentEditor({
  content,
  courseId,
  moduleId,
  wsId,
}: ModuleContentEditorProps) {
  const [post, setPost] = useState<JSONContent | null>(content ?? null);
  const t = useTranslations();

  const saveMutation = useMutation({
    mutationFn: async (nextContent: JSONContent | null) =>
      updateWorkspaceCourseModule(wsId, moduleId, {
        content: nextContent,
        group_id: courseId,
      }),
    onError: () => {
      toast.error(t('common.error_saving_content'));
    },
  });

  const queuedContentRef = useRef<JSONContent | null>(content ?? null);
  const queuedSessionRef = useRef(0);
  const queuedRevisionRef = useRef(0);
  const lastPersistedRevisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const editorSessionRef = useRef(0);
  const saveContentRef = useRef(saveMutation.mutateAsync);
  const pendingServerContentRef = useRef<JSONContent | null | undefined>(
    undefined
  );
  const debouncedSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    saveContentRef.current = saveMutation.mutateAsync;
  }, [saveMutation.mutateAsync]);

  // Serialize debounced writes so older requests cannot overwrite newer edits.
  const flushQueuedSave = useCallback(async (sessionId: number) => {
    if (
      saveInFlightRef.current ||
      sessionId !== editorSessionRef.current ||
      queuedSessionRef.current !== sessionId ||
      queuedRevisionRef.current === lastPersistedRevisionRef.current
    ) {
      return;
    }

    saveInFlightRef.current = true;
    const revision = queuedRevisionRef.current;
    const nextContent = queuedContentRef.current;
    let didPersist = false;

    try {
      await saveContentRef.current(nextContent);
      if (sessionId === editorSessionRef.current) {
        lastPersistedRevisionRef.current = revision;
        didPersist = true;
      }
    } catch {
      return;
    } finally {
      saveInFlightRef.current = false;

      if (
        didPersist &&
        pendingServerContentRef.current !== undefined &&
        queuedSessionRef.current === sessionId &&
        queuedRevisionRef.current === lastPersistedRevisionRef.current
      ) {
        if (isSameContent(pendingServerContentRef.current, nextContent)) {
          queuedContentRef.current = pendingServerContentRef.current;
          setPost(pendingServerContentRef.current);
        }

        pendingServerContentRef.current = undefined;
      }

      const activeSessionId = editorSessionRef.current;
      const hasPendingQueuedSave =
        queuedSessionRef.current === activeSessionId &&
        (activeSessionId === sessionId
          ? queuedRevisionRef.current > revision
          : queuedRevisionRef.current > lastPersistedRevisionRef.current);

      if (hasPendingQueuedSave) {
        void flushQueuedSave(activeSessionId);
      }
    }
  }, []);

  const clearDebouncedSave = useCallback(() => {
    if (debouncedSaveTimeoutRef.current) {
      clearTimeout(debouncedSaveTimeoutRef.current);
      debouncedSaveTimeoutRef.current = null;
    }
  }, []);

  const scheduleDebouncedSave = useCallback(
    (sessionId: number) => {
      clearDebouncedSave();
      debouncedSaveTimeoutRef.current = setTimeout(() => {
        debouncedSaveTimeoutRef.current = null;
        void flushQueuedSave(sessionId);
      }, CONTENT_SAVE_DEBOUNCE_MS);
    },
    [clearDebouncedSave, flushQueuedSave]
  );

  useEffect(() => {
    return () => {
      clearDebouncedSave();
      void flushQueuedSave(editorSessionRef.current);
    };
  }, [clearDebouncedSave, flushQueuedSave]);

  useEffect(() => {
    if (!(wsId && courseId && moduleId)) {
      return;
    }

    clearDebouncedSave();
    void flushQueuedSave(editorSessionRef.current);

    editorSessionRef.current += 1;
    queuedSessionRef.current = editorSessionRef.current;
    queuedRevisionRef.current = 0;
    lastPersistedRevisionRef.current = 0;
    pendingServerContentRef.current = undefined;
    queuedContentRef.current = null;
    setPost(null);
  }, [clearDebouncedSave, courseId, flushQueuedSave, moduleId, wsId]);

  useEffect(() => {
    const nextServerContent = content ?? null;

    if (
      saveInFlightRef.current ||
      queuedRevisionRef.current !== lastPersistedRevisionRef.current
    ) {
      pendingServerContentRef.current = nextServerContent;
      return;
    }

    pendingServerContentRef.current = undefined;
    queuedContentRef.current = nextServerContent;
    setPost(nextServerContent);
  }, [content]);

  const onChange = (nextContent: JSONContent | null) => {
    setPost(nextContent);
    queuedSessionRef.current = editorSessionRef.current;
    queuedRevisionRef.current += 1;
    queuedContentRef.current = nextContent;
    scheduleDebouncedSave(editorSessionRef.current);
  };

  return (
    <div className="mx-auto w-full pt-2 text-foreground">
      <RichTextEditor
        content={post}
        onChange={onChange}
        titlePlaceholder={t('common.whats_the_title')}
        writePlaceholder={t('common.write_something')}
        saveButtonLabel={t('common.save')}
        savedButtonLabel={t('common.saved')}
      />
    </div>
  );
}
