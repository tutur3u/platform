'use client';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { CodingLanguage } from '../coding/languages';
import {
  type ProgrammingDraft,
  type ProgrammingDraftScope,
  ProgrammingDraftStore,
  programmingDraftKey,
} from './drafts';

const store = new ProgrammingDraftStore(() =>
  typeof window === 'undefined' ? null : window.sessionStorage
);
export function useProgrammingDraft(
  scope: ProgrammingDraftScope | undefined,
  initialLanguage: CodingLanguage
) {
  const key = scope ? programmingDraftKey(scope) : 'unused-legacy-draft';
  const fallback = useMemo<ProgrammingDraft>(
    () => ({
      language: initialLanguage,
      tab: 'cases',
      sources: {},
      customInput: '',
      customExpected: '',
      submissionId: null,
      inspectedId: null,
    }),
    [initialLanguage]
  );
  const subscribe = useCallback(
    (callback: () => void) =>
      scope ? store.subscribe(key, callback) : () => {},
    [key, scope]
  );
  const getSnapshot = useCallback(
    () => (scope ? store.get(key, fallback) : fallback),
    [key, scope, fallback]
  );
  const draft = useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  const update = useCallback(
    (change: (previous: ProgrammingDraft) => ProgrammingDraft) => {
      if (scope) store.update(key, fallback, change);
    },
    [key, scope, fallback]
  );
  return { draft, update };
}
