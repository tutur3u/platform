'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listWorkspaceCourseModules,
  updateWorkspaceCourseModule,
} from '@tuturuuu/internal-api/education';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useRef } from 'react';
import { useDebouncedCallback } from 'use-debounce';

const SAVE_DEBOUNCE_MS = 800;

// ─── Query key ────────────────────────────────────────────────────────────────

export const lessonQueryKey = (wsId: string, courseId: string) => [
  'course-modules',
  wsId,
  courseId,
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLessonDetail(
  wsId: string,
  courseId: string,
  lessonId: string
) {
  const qc = useQueryClient();

  // Fetch all modules for the course and find this one
  const modulesQuery = useQuery({
    enabled: Boolean(wsId) && Boolean(courseId),
    queryFn: () => listWorkspaceCourseModules(wsId, courseId),
    queryKey: lessonQueryKey(wsId, courseId),
  });

  const lesson = (modulesQuery.data ?? []).find((m) => m.id === lessonId) ?? null;

  // ─── Save mutation ──────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      updateWorkspaceCourseModule(wsId, lessonId, payload),
    onError: () => {
      toast.error('Failed to save lesson. Please try again.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lessonQueryKey(wsId, courseId) });
    },
  });

  // ─── Serialized debounced content save (per AGENTS.md autosave rules) ──────

  const queuedContentRef = useRef<JSONContent | null>(null);
  const queuedRevisionRef = useRef(0);
  const lastPersistedRevisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const sessionRef = useRef(0);
  const saveMutateRef = useRef(saveMutation.mutateAsync);

  useEffect(() => {
    saveMutateRef.current = saveMutation.mutateAsync;
  }, [saveMutation.mutateAsync]);

  const flushContentSave = useCallback(async (sessionId: number) => {
    if (
      saveInFlightRef.current ||
      sessionId !== sessionRef.current ||
      queuedRevisionRef.current === lastPersistedRevisionRef.current
    ) {
      return;
    }

    saveInFlightRef.current = true;
    const revision = queuedRevisionRef.current;
    const content = queuedContentRef.current;

    try {
      await saveMutateRef.current({ content });
      if (sessionId === sessionRef.current) {
        lastPersistedRevisionRef.current = revision;
      }
    } catch {
      // onError toast already fired
    } finally {
      saveInFlightRef.current = false;
      const hasPending =
        sessionRef.current === sessionId &&
        queuedRevisionRef.current > revision;
      if (hasPending) void flushContentSave(sessionId);
    }
  }, []);

  const debouncedFlush = useDebouncedCallback((sessionId: number) => {
    void flushContentSave(sessionId);
  }, SAVE_DEBOUNCE_MS);

  // Flush on unmount
  useEffect(() => {
    return () => {
      debouncedFlush.flush();
      void flushContentSave(sessionRef.current);
    };
  }, [debouncedFlush, flushContentSave]);

  function queueContentSave(content: JSONContent | null) {
    queuedContentRef.current = content;
    queuedRevisionRef.current += 1;
    debouncedFlush(sessionRef.current);
  }

  // ─── Field saves ───────────────────────────────────────────────────────────

  function saveName(name: string) {
    saveMutation.mutate({ name });
  }

  function saveYoutubeLinks(youtube_links: string[]) {
    saveMutation.mutate({ youtube_links });
  }

  function savePublished(is_published: boolean) {
    saveMutation.mutate({ is_published });
  }

  return {
    lesson,
    isLoading: modulesQuery.isLoading,
    isError: modulesQuery.isError,
    isSaving: saveMutation.isPending || saveInFlightRef.current,
    queueContentSave,
    saveName,
    saveYoutubeLinks,
    savePublished,
  };
}
