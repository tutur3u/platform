/**
 * Best-effort access audit for the `workspaces` Storage bucket.
 *
 * Server-side signers and Drive routes record who signed, listed,
 * downloaded, uploaded, deleted or shared which object, and the outcome.
 * Rows land in `private.storage_access_events` (90-day retention).
 *
 * Guarantees:
 * - `record()` is synchronous and never throws; writes are fire-and-forget
 *   (handed to the host's `waitUntil` when one exists) and never block or
 *   fail the user request.
 * - Bounded: at most `maxEventsPerRecord` rows per call, at most
 *   `maxPendingWrites` concurrent writes (extra events are dropped and
 *   counted), and repeated identical allowed events are de-duplicated for
 *   `dedupeWindowMs`. Denials and errors are always recorded.
 * - No PII beyond the actor id: objects are reduced to the workspace, the
 *   lower-cased root segment and the Storage object id or a SHA-256 hash of
 *   the full object name. File names never leave this module.
 *
 * Framework-independent: the insert sink and scheduler are injected.
 */

export type StorageAccessAction =
  | 'sign'
  | 'list'
  | 'download'
  | 'upload'
  | 'delete'
  | 'share';

export type StorageAccessOutcome = 'allowed' | 'denied' | 'invalid' | 'error';

export type StorageAccessActorKind = 'user' | 'api_key' | 'anonymous';

export interface StorageAccessAuditEvent {
  action: StorageAccessAction;
  outcome: StorageAccessOutcome;
  /** Route template, e.g. `/api/v1/workspaces/[wsId]/storage/share`. */
  route: string;
  actorId?: string | null;
  actorKind?: StorageAccessActorKind;
  wsId?: string | null;
  /** Object or folder name, relative to the workspace or `<wsId>/...`. */
  path?: string | null;
  /** `folder` for listings: a single segment is then a root, not a file. */
  kind?: 'object' | 'folder';
  objectId?: string | null;
  /** Objects covered by a batch or listing (default 1). */
  itemCount?: number;
}

export interface StorageAccessAuditRow {
  action: StorageAccessAction;
  actor_id: string | null;
  actor_kind: StorageAccessActorKind;
  item_count: number;
  object_hash: string | null;
  object_id: string | null;
  outcome: StorageAccessOutcome;
  path_root: string | null;
  route: string;
  ws_id: string | null;
}

export interface StorageAccessAuditorOptions {
  insert: (rows: StorageAccessAuditRow[]) => Promise<unknown>;
  schedule?: (work: Promise<unknown>) => void;
  maxPendingWrites?: number;
  maxEventsPerRecord?: number;
  dedupeWindowMs?: number;
  dedupeMaxKeys?: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}

export interface StorageAccessAuditor {
  record(events: StorageAccessAuditEvent | StorageAccessAuditEvent[]): void;
  /** Resolves when all writes started so far have settled (tests, shutdown). */
  settled(): Promise<void>;
  stats(): { dropped: number; pending: number; written: number };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE_PATTERN = /^\/api\/[A-Za-z0-9/_.:[\]-]*$/;
const ACTIONS = new Set<StorageAccessAction>([
  'sign',
  'list',
  'download',
  'upload',
  'delete',
  'share',
]);
const OUTCOMES = new Set<StorageAccessOutcome>([
  'allowed',
  'denied',
  'invalid',
  'error',
]);
/** Root-level files (`<wsId>/<file>`) have no folder; never log the name. */
export const ROOT_LEVEL_PATH_ROOT = '(root)';

function uuidOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function splitObjectName(
  wsId: string | null,
  path: string,
  kind: 'object' | 'folder' = 'object'
): { fullName: string; root: string } | null {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (!trimmed) return null;
  const relative =
    wsId && trimmed.toLowerCase().startsWith(`${wsId}/`)
      ? trimmed.slice(wsId.length + 1)
      : trimmed;
  if (!relative) return null;
  const segments = relative.split('/');
  const root =
    segments.length > 1 || kind === 'folder'
      ? segments[0]!.toLowerCase().slice(0, 64) || ROOT_LEVEL_PATH_ROOT
      : ROOT_LEVEL_PATH_ROOT;
  const name = kind === 'folder' ? `${relative}/` : relative;
  return { fullName: wsId ? `${wsId}/${name}` : name, root };
}

/** Reduces an event to a bounded, file-name-free row, or null if invalid. */
export async function toStorageAccessAuditRow(
  event: StorageAccessAuditEvent
): Promise<StorageAccessAuditRow | null> {
  if (
    !ACTIONS.has(event.action) ||
    !OUTCOMES.has(event.outcome) ||
    typeof event.route !== 'string' ||
    event.route.length < 5 ||
    event.route.length > 128 ||
    !ROUTE_PATTERN.test(event.route)
  ) {
    return null;
  }

  const wsId = uuidOrNull(event.wsId);
  const objectId = uuidOrNull(event.objectId);
  const actorId = uuidOrNull(event.actorId);
  const object = event.path
    ? splitObjectName(wsId, event.path, event.kind)
    : null;
  const itemCount = Math.min(
    1000,
    Math.max(
      0,
      Math.trunc(Number.isFinite(event.itemCount) ? event.itemCount! : 1)
    )
  );

  return {
    action: event.action,
    actor_id: actorId,
    actor_kind: actorId ? (event.actorKind ?? 'user') : 'anonymous',
    item_count: itemCount,
    object_hash: !objectId && object ? await sha256Hex(object.fullName) : null,
    object_id: objectId,
    outcome: event.outcome,
    path_root: object?.root ?? null,
    route: event.route,
    ws_id: wsId,
  };
}

/** Maps a final HTTP status to an audit outcome. */
export function storageAccessOutcomeFromStatus(
  status: number
): StorageAccessOutcome {
  if (status < 400) return 'allowed';
  if (status === 401 || status === 403) return 'denied';
  if (status >= 500) return 'error';
  return 'invalid';
}

export function createStorageAccessAuditor(
  options: StorageAccessAuditorOptions
): StorageAccessAuditor {
  const maxPending = options.maxPendingWrites ?? 32;
  const maxEvents = options.maxEventsPerRecord ?? 50;
  const dedupeWindowMs = options.dedupeWindowMs ?? 60_000;
  const dedupeMaxKeys = options.dedupeMaxKeys ?? 2_000;
  const now = options.now ?? Date.now;
  const recent = new Map<string, number>();
  const inFlight = new Set<Promise<void>>();
  let dropped = 0;
  let written = 0;

  const isDuplicate = (event: StorageAccessAuditEvent) => {
    if (event.outcome !== 'allowed' || dedupeWindowMs <= 0) return false;
    const key = [
      event.actorId,
      event.wsId,
      event.path,
      event.objectId,
      event.action,
      event.route,
    ].join('\u0000');
    const at = now();
    const seen = recent.get(key);
    if (seen !== undefined && at - seen < dedupeWindowMs) return true;
    recent.delete(key);
    recent.set(key, at);
    // Map keeps insertion order: evict the oldest keys beyond the bound.
    while (recent.size > dedupeMaxKeys) {
      const oldest = recent.keys().next().value;
      if (oldest === undefined) break;
      recent.delete(oldest);
    }
    return false;
  };

  const report = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      // Error reporting must never escape either.
    }
  };

  return {
    record(input) {
      try {
        const all = Array.isArray(input) ? input : [input];
        const bounded = all.slice(0, maxEvents);
        dropped += all.length - bounded.length;
        if (inFlight.size >= maxPending) {
          dropped += bounded.length;
          return;
        }
        const events = bounded.filter((e) => !isDuplicate(e));
        if (events.length === 0) return;
        const work: Promise<void> = (async () => {
          const rows = (
            await Promise.all(events.map((e) => toStorageAccessAuditRow(e)))
          ).filter((row): row is StorageAccessAuditRow => row !== null);
          if (rows.length === 0) return;
          await options.insert(rows);
          written += rows.length;
        })()
          .catch(report)
          .finally(() => {
            inFlight.delete(work);
          });
        inFlight.add(work);
        options.schedule?.(work);
      } catch (error) {
        report(error);
      }
    },
    async settled() {
      await Promise.allSettled([...inFlight]);
    },
    stats: () => ({ dropped, pending: inFlight.size, written }),
  };
}

/**
 * Collects the context a route learns while it runs (actor, workspace, path)
 * and records one event from the final response status. Routes call
 * `set()` as values become known and return `finish(response)`.
 */
export function createStorageAccessAuditScope(
  auditor: Pick<StorageAccessAuditor, 'record'>,
  base: Pick<StorageAccessAuditEvent, 'action' | 'route'> &
    Partial<StorageAccessAuditEvent>
) {
  let event: StorageAccessAuditEvent = { outcome: 'error', ...base };
  let skipped = false;
  return {
    set(values: Partial<Omit<StorageAccessAuditEvent, 'action' | 'route'>>) {
      event = { ...event, ...values };
    },
    /** The route recorded per-object rows itself; finish() adds none. */
    skip() {
      skipped = true;
    },
    finish<T extends { status: number }>(response: T): T {
      if (!skipped) {
        auditor.record({
          ...event,
          outcome: storageAccessOutcomeFromStatus(response.status),
        });
      }
      return response;
    },
  };
}
