import type {
  MeetProgrammingCheckLanguage,
  MeetProgrammingDiagnostic,
} from '@tuturuuu/internal-api/meet-call';
import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';

/** Pure diagnostics rules, kept free of React and Monaco for unit tests. */
export type CodeDiagnostic = MeetProgrammingDiagnostic;
export type CheckFiles = { path: string; content: string }[];

/** A host-owned compiler check, e.g. Meet's call-scoped `?check` endpoint. */
export type WorkbenchCheck = (
  payload: {
    requestId: string;
    language: MeetProgrammingCheckLanguage;
    files: CheckFiles;
  },
  signal: AbortSignal
) => Promise<{
  requestId: string;
  diagnostics: CodeDiagnostic[];
  truncated: boolean;
}>;

/** Monaco's own owner for script problems is the TS worker; checked problems use their own. */
export const CHECK_MARKER_OWNER = 'playground-check';
/** Quiet time after the last edit before a check starts; Java's compiler is the slowest. */
export const CHECK_IDLE_MS: Readonly<Record<'c' | 'cpp' | 'java', number>> = {
  c: 1500,
  cpp: 1500,
  java: 2500,
};
export const checkIdleMs = (language: PlaygroundLanguage | undefined) =>
  CHECK_IDLE_MS[language as keyof typeof CHECK_IDLE_MS] ?? CHECK_IDLE_MS.c;
/** A warming checker is retried quietly this many times before checks pause. */
export const CHECK_WARMING_RETRIES = 3;
export const CHECK_LIMITS = {
  files: 20,
  fileBytes: 128 * 1024,
  totalBytes: 200 * 1024,
};
const REMOTE_LANGUAGES: readonly PlaygroundLanguage[] = ['c', 'cpp', 'java'];

/**
 * Who reports problems for a language: Monaco's TypeScript worker in the
 * browser, the room's compiler check on the server, or nobody. A Python
 * worker plugs in here as another browser provider.
 */
export type DiagnosticsProvider = 'script' | 'remote';
export function diagnosticsProvider(
  language: PlaygroundLanguage | undefined,
  remote: boolean
): DiagnosticsProvider | null {
  if (language === 'typescript' || language === 'javascript') return 'script';
  if (remote && language && REMOTE_LANGUAGES.includes(language))
    return 'remote';
  return null;
}

/**
 * The footer state. `off` hides it: no provider, a checker that is not
 * deployed, or a language it does not support. `tooLarge` means the files
 * are over the checker's limits and carry no checked problems.
 */
export type DiagnosticsStatus =
  | { kind: 'off' }
  | { kind: 'checking' }
  | { kind: 'paused' }
  | { kind: 'tooLarge' }
  | { kind: 'ready'; problems: number };

/** FNV-1a over the language and every file, so an unchanged room is not checked twice. */
export function checkHash(language: string, files: CheckFiles) {
  let hash = 0x811c9dc5;
  const feed = (text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x1f;
    hash = Math.imul(hash, 0x01000193);
  };
  feed(language);
  for (const file of files) {
    feed(file.path);
    feed(file.content);
  }
  return (hash >>> 0).toString(16);
}

const encoder = new TextEncoder();
export function withinCheckLimits(files: CheckFiles) {
  if (files.length === 0 || files.length > CHECK_LIMITS.files) return false;
  let total = 0;
  for (const file of files) {
    const size = encoder.encode(file.content).length;
    if (size > CHECK_LIMITS.fileBytes) return false;
    total += size;
  }
  return total <= CHECK_LIMITS.totalBytes;
}

/** What a refused or failed check means for the next one. */
export type CheckRefusal =
  | { kind: 'warming'; retryAfterSeconds: number }
  | { kind: 'busy'; retryAfterSeconds: number }
  | { kind: 'quota'; retryAfterSeconds: number }
  | { kind: 'unavailable' }
  | { kind: 'conflict' }
  | { kind: 'superseded' }
  | { kind: 'unsupported' }
  | { kind: 'aborted' }
  | { kind: 'failed' };

export function checkRefusal(error: unknown): CheckRefusal {
  if (error instanceof DOMException && error.name === 'AbortError')
    return { kind: 'aborted' };
  const source = (error && typeof error === 'object' ? error : {}) as {
    name?: unknown;
    status?: unknown;
    code?: unknown;
    retryAfter?: unknown;
  };
  if (source.name === 'AbortError') return { kind: 'aborted' };
  const status = Number(source.status);
  const hint = Number(source.retryAfter);
  const after = (fallback: number) =>
    Number.isFinite(hint) && hint > 0 ? Math.ceil(hint) : fallback;
  switch (source.code) {
    case 'PLAYGROUND_WARMING':
      return { kind: 'warming', retryAfterSeconds: after(2) };
    case 'PLAYGROUND_BUSY':
      return { kind: 'busy', retryAfterSeconds: after(5) };
    case 'PLAYGROUND_QUOTA':
      return { kind: 'quota', retryAfterSeconds: after(60) };
    case 'PLAYGROUND_UNAVAILABLE':
      return { kind: 'unavailable' };
    case 'PLAYGROUND_REQUEST_CONFLICT':
      return { kind: 'conflict' };
    case 'PLAYGROUND_SUPERSEDED':
      return { kind: 'superseded' };
  }
  // Not deployed yet (404/405) or a language the checker does not take (400).
  if (status === 400 || status === 404 || status === 405)
    return { kind: 'unsupported' };
  if (status === 503) return { kind: 'unavailable' };
  return { kind: 'failed' };
}

/** Monaco's MarkerSeverity values, so this module does not import Monaco. */
export const MARKER_SEVERITY = { error: 8, warning: 4, info: 2 } as const;
export interface CheckMarker {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  severity: number;
  message: string;
  code?: string;
  source: string;
}

/**
 * Compiler positions and Monaco positions are both 1-based. A missing end is
 * the start, which Monaco widens to the word there; an end before the start
 * is clamped to it.
 */
export function toCheckMarker(diagnostic: CodeDiagnostic): CheckMarker {
  const line = Math.max(1, Math.floor(diagnostic.line) || 1);
  const column = Math.max(1, Math.floor(diagnostic.column) || 1);
  const endLine = Math.max(line, Math.floor(diagnostic.endLine ?? line));
  const endColumn =
    endLine === line
      ? Math.max(column, Math.floor(diagnostic.endColumn ?? column))
      : Math.max(1, Math.floor(diagnostic.endColumn ?? 1));
  return {
    startLineNumber: line,
    startColumn: column,
    endLineNumber: endLine,
    endColumn,
    severity: MARKER_SEVERITY[diagnostic.severity] ?? MARKER_SEVERITY.info,
    message: diagnostic.message,
    code: diagnostic.code,
    source: diagnostic.source,
  };
}

/** Markers per checked file; a file without diagnostics gets an empty list so old ones clear. */
export function markersByPath(
  files: CheckFiles,
  diagnostics: CodeDiagnostic[]
) {
  const byPath = new Map<string, CheckMarker[]>(
    files.map((file) => [file.path, []])
  );
  for (const diagnostic of diagnostics)
    byPath.get(diagnostic.path)?.push(toCheckMarker(diagnostic));
  return byPath;
}
