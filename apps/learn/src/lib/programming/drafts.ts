import { type CodingLanguage, isCodingLanguage } from '../coding/languages';

export interface ProgrammingDraftScope {
  actorId: string;
  wsId: string;
  learnerId: string;
  problemId: string;
}
export interface ProgrammingDraft {
  language: CodingLanguage;
  tab: 'cases' | 'result' | 'history';
  sources: Partial<Record<CodingLanguage, string>>;
  customInput: string;
  customExpected: string;
  submissionId: string | null;
  inspectedId: string | null;
}
export function programmingDraftKey(scope: ProgrammingDraftScope) {
  return `ttr-programming-v1:${JSON.stringify([scope.actorId, scope.wsId, scope.learnerId, scope.problemId])}`;
}
export function readProgrammingDraft(
  raw: string | null
): ProgrammingDraft | null {
  if (!raw || raw.length > 1_000_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const row = value as Record<string, unknown>;
    if (
      !['cases', 'result', 'history'].includes(String(row.tab)) ||
      !isCodingLanguage(row.language) ||
      !row.sources ||
      typeof row.sources !== 'object' ||
      Array.isArray(row.sources) ||
      typeof row.customInput !== 'string' ||
      typeof row.customExpected !== 'string' ||
      !(row.submissionId === null || typeof row.submissionId === 'string') ||
      !(row.inspectedId === null || typeof row.inspectedId === 'string')
    )
      return null;
    const sources: ProgrammingDraft['sources'] = {};
    for (const [language, source] of Object.entries(row.sources)) {
      if (!isCodingLanguage(language) || typeof source !== 'string')
        return null;
      sources[language] = source;
    }
    return {
      language: row.language,
      tab: row.tab as ProgrammingDraft['tab'],
      sources,
      customInput: row.customInput,
      customExpected: row.customExpected,
      submissionId: row.submissionId,
      inspectedId: row.inspectedId,
    };
  } catch {
    return null;
  }
}

/** Tab-scoped storage with an in-memory fallback. Only a server-authorized scope
 * is supplied by the page; storage does not convey authorization to any API. */
export class ProgrammingDraftStore {
  private snapshots = new Map<string, ProgrammingDraft>();
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Map<string, Set<() => void>>();
  constructor(
    private storage: () => Pick<Storage, 'getItem' | 'setItem'> | null
  ) {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush());
      window.addEventListener('beforeunload', () => this.flush());
    }
  }
  get(key: string, fallback: ProgrammingDraft) {
    const current = this.snapshots.get(key);
    if (current) return current;
    let stored: ProgrammingDraft | null = null;
    try {
      stored = readProgrammingDraft(this.storage()?.getItem(key) ?? null);
    } catch {}
    const snapshot = stored ?? fallback;
    this.snapshots.set(key, snapshot);
    return snapshot;
  }
  update(
    key: string,
    fallback: ProgrammingDraft,
    update: (draft: ProgrammingDraft) => ProgrammingDraft
  ) {
    const next = update(this.get(key, fallback));
    this.snapshots.set(key, next);
    this.dirty.add(key);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
    for (const listener of this.listeners.get(key) ?? []) listener();
  }
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const key of this.dirty) {
      try {
        this.storage()?.setItem(key, JSON.stringify(this.snapshots.get(key)));
      } catch {}
    }
    this.dirty.clear();
  }
  subscribe(key: string, callback: () => void) {
    const listeners = this.listeners.get(key) ?? new Set();
    listeners.add(callback);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(callback);
      if (!listeners.size) this.listeners.delete(key);
    };
  }
}
