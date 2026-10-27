'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getTopicScheduleMonth,
  saveTopicScheduleMonth,
  type TopicScheduleRowError,
  TopicScheduleSaveRejectedError,
} from '@tuturuuu/internal-api/topic-announcements';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  countDraftChanges,
  type DraftSession,
  draftFromSessions,
  draftSavePayload,
  newDraftSession,
  validateDraft,
} from './schedule-draft';

export const topicScheduleQueryKey = (wsId: string, month: string) =>
  ['topic-schedule', wsId, month] as const;

const EMPTY: DraftSession[] = [];

/**
 * Editor state for one month. Edits live in `edited` on top of the loaded
 * sessions (null = untouched), so the server data is shown until the first
 * change and again after a save or discard, without syncing in an effect.
 */
export function useScheduleEditor(wsId: string, month: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: () => getTopicScheduleMonth(wsId, month),
    queryKey: topicScheduleQueryKey(wsId, month),
    select: (response) => response.data,
  });

  const original = useMemo(
    () => (query.data ? draftFromSessions(query.data.sessions) : EMPTY),
    [query.data]
  );
  const [edited, setEdited] = useState<DraftSession[] | null>(null);
  const [serverErrors, setServerErrors] = useState<
    Map<string, TopicScheduleRowError['code'][]>
  >(new Map());
  const sequence = useRef(0);
  const rows = edited ?? original;

  const issues = useMemo(() => validateDraft(rows, month), [month, rows]);
  const changeCount = useMemo(
    () => countDraftChanges(rows, original),
    [original, rows]
  );
  const originalByKey = useMemo(
    () => new Map(original.map((row) => [row.key, row])),
    [original]
  );

  const update = useCallback(
    (next: (current: DraftSession[]) => DraftSession[]) => {
      setEdited((current) => next(current ?? original));
      setServerErrors(new Map());
    },
    [original]
  );

  const addSession = useCallback(
    (sessionDate: string, template?: Partial<DraftSession>) => {
      sequence.current += 1;
      const key = `new:${sequence.current}`;
      update((current) => {
        const previous = current.at(-1);
        return [
          ...current,
          {
            ...newDraftSession(key, sessionDate, previous),
            ...template,
            key,
            id: null,
          },
        ];
      });
      return key;
    },
    [update]
  );

  const updateRow = useCallback(
    (key: string, patch: Partial<DraftSession>) =>
      update((current) =>
        current.map((row) => (row.key === key ? { ...row, ...patch } : row))
      ),
    [update]
  );

  const removeRow = useCallback(
    (key: string) =>
      update((current) => current.filter((row) => row.key !== key)),
    [update]
  );

  const discard = useCallback(() => {
    setEdited(null);
    setServerErrors(new Map());
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { payload, sessionKeys } = draftSavePayload(rows, original, month);
      try {
        return await saveTopicScheduleMonth(wsId, payload);
      } catch (error) {
        if (error instanceof TopicScheduleSaveRejectedError) {
          setServerErrors(
            mapServerErrors(error.rowErrors, sessionKeys, original)
          );
        }
        throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: topicScheduleQueryKey(wsId, month),
      });
      setEdited(null);
    },
  });

  return {
    addSession,
    changeCount,
    data: query.data,
    discard,
    isDirty: changeCount > 0,
    issues,
    original,
    originalByKey,
    query,
    removeRow,
    rows,
    save: saveMutation,
    serverErrors,
    updateRow,
  };
}

/** Maps rejected-save row errors back to the editor rows they belong to. */
function mapServerErrors(
  rowErrors: readonly TopicScheduleRowError[],
  sessionKeys: readonly string[],
  original: readonly DraftSession[]
) {
  const byKey = new Map<string, TopicScheduleRowError['code'][]>();
  for (const error of rowErrors) {
    const key =
      error.index !== null
        ? sessionKeys[error.index]
        : original.find((row) => row.id === error.sessionId)?.key;
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), error.code]);
  }
  return byKey;
}
