'use client';

import { useMutation } from '@tanstack/react-query';
import { updateWorkspaceCourseModule } from '@tuturuuu/internal-api/education';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { toast } from '@tuturuuu/ui/sonner';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

const CONTENT_SAVE_DEBOUNCE_MS = 500;

interface Props {
  wsId: string;
  courseId: string;
  moduleId: string;
  content?: JSONContent;
}

export function ModuleContentEditor({
  wsId,
  courseId,
  moduleId,
  content,
}: Props) {
  const [post, setPost] = useState<JSONContent | null>(content || null);
  const t = useTranslations();
  const editorIdentity = `${wsId}:${courseId}:${moduleId}`;

  const saveMutation = useMutation({
    mutationFn: async (nextContent: JSONContent | null) =>
      updateWorkspaceCourseModule(wsId, moduleId, {
        group_id: courseId,
        content: nextContent,
      }),
    onError: () => {
      toast.error(t('common.error_saving_content'));
    },
  });

  const queuedContentRef = useRef<JSONContent | null>(content || null);
  const queuedSessionRef = useRef(0);
  const queuedRevisionRef = useRef(0);
  const lastPersistedRevisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const editorSessionRef = useRef(0);
  const saveContentRef = useRef(saveMutation.mutateAsync);

  useEffect(() => {
    saveContentRef.current = saveMutation.mutateAsync;
  }, [saveMutation.mutateAsync]);

  // Serialize debounced writes so an older request cannot overwrite newer content.
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

    try {
      await saveContentRef.current(nextContent);
      if (sessionId === editorSessionRef.current) {
        lastPersistedRevisionRef.current = revision;
      }
    } finally {
      saveInFlightRef.current = false;

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

  const debouncedSave = useDebouncedCallback((sessionId: number) => {
    void flushQueuedSave(sessionId);
  }, CONTENT_SAVE_DEBOUNCE_MS);

  useEffect(() => {
    if (!editorIdentity) {
      return;
    }

    return () => {
      debouncedSave.flush();
      void flushQueuedSave(editorSessionRef.current);
    };
  }, [debouncedSave, editorIdentity, flushQueuedSave]);

  useEffect(() => {
    if (!editorIdentity) {
      return;
    }

    editorSessionRef.current += 1;
    queuedSessionRef.current = editorSessionRef.current;
    queuedRevisionRef.current = 0;
    lastPersistedRevisionRef.current = 0;
    queuedContentRef.current = null;
    setPost(null);
  }, [editorIdentity]);

  useEffect(() => {
    if (
      saveInFlightRef.current ||
      queuedRevisionRef.current !== lastPersistedRevisionRef.current
    ) {
      return;
    }

    queuedContentRef.current = content || null;
    setPost(content || null);
  }, [content]);

  const onChange = (nextContent: JSONContent | null) => {
    setPost(nextContent);
    queuedSessionRef.current = editorSessionRef.current;
    queuedRevisionRef.current += 1;
    queuedContentRef.current = nextContent;
    debouncedSave(editorSessionRef.current);
  };

  const titlePlaceholder = t('common.whats_the_title');
  const writePlaceholder = t('common.write_something');
  const saveButtonLabel = t('common.save');
  const savedButtonLabel = t('common.saved');

  return (
    <div className="mx-auto w-full pt-2 text-foreground">
      <RichTextEditor
        content={post}
        onChange={onChange}
        titlePlaceholder={titlePlaceholder}
        writePlaceholder={writePlaceholder}
        saveButtonLabel={saveButtonLabel}
        savedButtonLabel={savedButtonLabel}
      />
    </div>
  );
}
