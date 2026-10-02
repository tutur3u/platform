import { describe, expect, it, vi } from 'vitest';
import {
  type ProgrammingDraft,
  ProgrammingDraftStore,
  programmingDraftKey,
  readProgrammingDraft,
} from './drafts';

const scope = {
  actorId: 'actor',
  wsId: 'workspace',
  learnerId: 'learner',
  problemId: 'problem',
};
const fallback: ProgrammingDraft = {
  language: 'python',
  tab: 'cases',
  sources: {},
  customInput: '',
  customExpected: '',
  submissionId: null,
  inspectedId: null,
};
describe('Programming reload/navigation draft scope', () => {
  it('isolates actor/workspace/learner/problem namespaces', () => {
    for (const field of Object.keys(scope))
      expect(programmingDraftKey({ ...scope, [field]: 'other' })).not.toBe(
        programmingDraftKey(scope)
      );
  });
  it('restores language sources, custom cases and inspected selection on a fresh store', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const first = new ProgrammingDraftStore(() => storage);
    const key = programmingDraftKey(scope);
    first.update(key, fallback, (draft) => ({
      ...draft,
      language: 'javascript',
      sources: { python: 'python draft', javascript: 'js draft' },
      customInput: 'custom',
      customExpected: 'expected',
      inspectedId: 'selected',
    }));
    first.flush();
    const reloaded = new ProgrammingDraftStore(() => storage);
    expect(reloaded.get(key, fallback)).toMatchObject({
      language: 'javascript',
      sources: { python: 'python draft', javascript: 'js draft' },
      customInput: 'custom',
      inspectedId: 'selected',
    });
    expect(
      reloaded.get(
        programmingDraftKey({ ...scope, actorId: 'other' }),
        fallback
      )
    ).toEqual(fallback);
  });
  it('retains drafts and notifies only the scoped listener if storage is unavailable', () => {
    const store = new ProgrammingDraftStore(() => {
      throw new Error('Unavailable');
    });
    const key = programmingDraftKey(scope);
    let otherNotifications = 0;
    const otherUnsubscribe = store.subscribe(
      programmingDraftKey({ ...scope, problemId: 'other' }),
      () => {
        otherNotifications++;
      }
    );
    let notifications = 0;
    const unsubscribe = store.subscribe(key, () => {
      notifications++;
    });
    store.update(key, fallback, (draft) => ({
      ...draft,
      sources: { python: 'unsaved locally' },
    }));
    expect(store.get(key, fallback).sources.python).toBe('unsaved locally');
    expect(notifications).toBe(1);
    unsubscribe();
    store.update(key, fallback, (draft) => ({ ...draft, customInput: 'next' }));
    expect(notifications).toBe(1);
    expect(otherNotifications).toBe(0);
    otherUnsubscribe();
    store.flush();
  });
  it('updates snapshots immediately while coalescing storage writes and flushing on navigation', () => {
    vi.useFakeTimers();
    try {
      const storage = { getItem: () => null, setItem: vi.fn() };
      const store = new ProgrammingDraftStore(() => storage);
      const key = programmingDraftKey(scope);
      store.update(key, fallback, (draft) => ({ ...draft, customInput: 'a' }));
      store.update(key, fallback, (draft) => ({ ...draft, customInput: 'ab' }));
      expect(store.get(key, fallback).customInput).toBe('ab');
      expect(storage.setItem).not.toHaveBeenCalled();
      vi.advanceTimersByTime(200);
      expect(storage.setItem).toHaveBeenCalledTimes(1);
      store.update(key, fallback, (draft) => ({
        ...draft,
        customInput: 'abc',
      }));
      window.dispatchEvent(new Event('pagehide'));
      expect(storage.setItem).toHaveBeenCalledTimes(2);
      expect(JSON.parse(storage.setItem.mock.calls[1]![1]).customInput).toBe(
        'abc'
      );
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects corrupt or unsupported persisted data without affecting the editor', () => {
    for (const value of [
      '{',
      JSON.stringify({ ...fallback, language: 'invalid' }),
      JSON.stringify({ ...fallback, sources: { python: 42 } }),
    ])
      expect(readProgrammingDraft(value)).toBeNull();
  });
});
