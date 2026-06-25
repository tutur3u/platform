'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listWorkspaceCourseModules,
  updateWorkspaceCourseModule,
} from '@tuturuuu/internal-api/education';
import type { WorkspaceCourseModule } from '@tuturuuu/types/db';
import type { JSONContent } from '@tuturuuu/types/tiptap';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import { useDebouncedCallback } from 'use-debounce';

const SAVE_DEBOUNCE_MS = 800;

type LessonUpdatePayload = Partial<
  Pick<
    WorkspaceCourseModule,
    'content' | 'is_published' | 'name' | 'youtube_links'
  >
>;

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
  const t = useTranslations('teachModules.lesson');
  const qc = useQueryClient();

  // Fetch all modules for the course and find this one
  const modulesQuery = useQuery({
    enabled: Boolean(wsId) && Boolean(courseId),
    queryFn: () => listWorkspaceCourseModules(wsId, courseId),
    queryKey: lessonQueryKey(wsId, courseId),
  });

  const rawLesson =
    (modulesQuery.data ?? []).find((m) => m.id === lessonId) ?? null;

  function normalizeNode(node: any): any | null {
    if (node === null || node === undefined) return null;
    // Strings -> text node
    if (typeof node === 'string') return { type: 'text', text: node };
    // Primitives -> text node of their string form
    if (typeof node !== 'object') return { type: 'text', text: String(node) };

    const out: any = { ...node };
    // Ensure attrs is not null (TipTap expects object or absent)
    if ('attrs' in out && out.attrs === null) delete out.attrs;

    // Ensure a type exists for text-like shapes
    if (!out.type) {
      if (typeof out.text === 'string') out.type = 'text';
      else out.type = 'paragraph';
    }

    if (Array.isArray(out.content)) {
      out.content = out.content.map(normalizeNode).filter(Boolean);
    }

    return out;
  }

  function normalizeTopLevelNode(node: any): any | null {
    const normalized = normalizeNode(node);
    if (!normalized) return null;

    if (normalized.type === 'text') {
      return {
        type: 'paragraph',
        content: [normalized],
      };
    }

    return normalized;
  }

  function normalizeContent(content: any): JSONContent | null {
    if (content === null || content === undefined) return null;

    // If someone stored a raw string or array, coerce into a proper doc
    if (typeof content === 'string') {
      return {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: content }] },
        ],
      } as JSONContent;
    }

    if (Array.isArray(content)) {
      // array of nodes -> wrap in doc
      return {
        type: 'doc',
        content: content.map(normalizeTopLevelNode).filter(Boolean),
      } as JSONContent;
    }

    // If it already looks like a TipTap doc/node
    const normalized = normalizeNode(content);
    if (!normalized) return null;
    if (normalized.type === 'doc') {
      return {
        ...normalized,
        content: Array.isArray(normalized.content)
          ? normalized.content.map(normalizeTopLevelNode).filter(Boolean)
          : [],
      } as JSONContent;
    }

    // Wrap single node into a doc
    return {
      type: 'doc',
      content: [normalizeTopLevelNode(normalized)].filter(Boolean),
    } as JSONContent;
  }

  const lesson = rawLesson
    ? { ...rawLesson, content: normalizeContent(rawLesson.content) }
    : null;

  // ─── Save mutation ──────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (payload: LessonUpdatePayload) =>
      updateWorkspaceCourseModule(wsId, lessonId, payload),
    onError: () => {
      toast.error(t('saveFailed'));
    },
    onSuccess: (_, variables) => {
      qc.setQueryData<WorkspaceCourseModule[] | undefined>(
        lessonQueryKey(wsId, courseId),
        (old) => {
          if (!old) return old;
          return old.map((m) =>
            m.id === lessonId ? { ...m, ...variables } : m
          );
        }
      );
      void qc.invalidateQueries({ queryKey: lessonQueryKey(wsId, courseId) });
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
