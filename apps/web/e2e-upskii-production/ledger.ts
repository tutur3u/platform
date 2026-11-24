import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Append-only run ledger. Every resource is recorded BEFORE the call that
 * creates it returns to the test (and again with its server id once known),
 * so a crash between creation and registration still leaves a sweepable
 * trace. Cleanup outcomes are appended as events; the current state of a
 * resource is the fold of its events. JSONL appends are atomic for the small
 * lines written here, so Playwright workers and the cleanup CLI can share it.
 */

/**
 * Owners are the cleanup roots: deleting a Tuturuuu QA run deletes its
 * accounts, run workspace (and the meetings, records and uploads inside it)
 * and their external links; purging an Upskii QA identity hard-deletes
 * everything it owns. Other kinds are recorded for the in-test product-API
 * cleanup and name the owner that guarantees them (`coveredBy`).
 */
export type ResourceKind =
  | 'tuturuuu-qa-run'
  | 'upskii-identity'
  | 'tuturuuu-meeting'
  | 'tuturuuu-upskii-link'
  | 'upskii-link'
  | 'upskii-object';

export const OWNER_KINDS: ReadonlySet<ResourceKind> = new Set([
  'tuturuuu-qa-run',
  'upskii-identity',
]);

/** Actor whose session performs the cleanup call. */
export type Actor = 'operator' | 'teacher' | 'learner' | 'outsider' | 'host';

export interface ResourceRecord {
  key: string;
  kind: ResourceKind;
  suite: string;
  actor: Actor;
  /** Server id; absent while creation is in flight. */
  id?: string;
  /**
   * Product-API cleanup for `upskii-object`: a DELETE (or documented
   * delete-action POST) on app.upskii.com, plus the GET that proves it gone.
   */
  cleanup?: {
    method: 'DELETE' | 'POST' | 'PATCH';
    path: string;
    body?: Record<string, unknown>;
    verifyPath?: string;
  };
  /** Ledger key of the owner whose deletion removes this resource. */
  coveredBy?: string;
  meta?: Record<string, string>;
}

type Event =
  | { type: 'register'; at: string; record: ResourceRecord }
  | { type: 'cleaned'; at: string; key: string; outcome: string }
  | { type: 'cleanup-failed'; at: string; key: string; error: string }
  | { type: 'verified'; at: string; key: string; gone: boolean };

export interface ResourceState extends ResourceRecord {
  cleaned: boolean;
  outcome?: string;
  errors: string[];
  verifiedGone?: boolean;
}

export class Ledger {
  constructor(
    readonly path: string,
    private readonly now: () => Date = () => new Date()
  ) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }

  private append(event: Event) {
    appendFileSync(this.path, `${JSON.stringify(event)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  register(record: ResourceRecord): ResourceRecord {
    if (!/^[a-z0-9:._-]{3,160}$/u.test(record.key))
      throw new Error('Invalid ledger key');
    this.append({ type: 'register', at: this.now().toISOString(), record });
    return record;
  }

  cleaned(key: string, outcome: string) {
    this.append({
      type: 'cleaned',
      at: this.now().toISOString(),
      key,
      outcome,
    });
  }

  failed(key: string, error: unknown) {
    this.append({
      type: 'cleanup-failed',
      at: this.now().toISOString(),
      key,
      // Errors are built from status codes and our own messages; never
      // bodies, cookies or tokens.
      error: String(error instanceof Error ? error.message : error).slice(
        0,
        300
      ),
    });
  }

  verified(key: string, gone: boolean) {
    this.append({
      type: 'verified',
      at: this.now().toISOString(),
      key,
      gone,
    });
  }

  /** Folded state in registration order (later registers merge fields). */
  read(): ResourceState[] {
    if (!existsSync(this.path)) return [];
    const states = new Map<string, ResourceState>();
    for (const line of readFileSync(this.path, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let event: Event;
      try {
        event = JSON.parse(line) as Event;
      } catch {
        // A torn final line from a killed process: ignore it, the sweep
        // covers anything it described.
        continue;
      }
      if (event.type === 'register') {
        const prior = states.get(event.record.key);
        states.set(event.record.key, {
          ...prior,
          ...event.record,
          meta: { ...prior?.meta, ...event.record.meta },
          cleaned: prior?.cleaned ?? false,
          errors: prior?.errors ?? [],
        });
        continue;
      }
      const state = states.get(event.key);
      if (!state) continue;
      if (event.type === 'cleaned') {
        state.cleaned = true;
        state.outcome = event.outcome;
      } else if (event.type === 'cleanup-failed') {
        state.errors.push(event.error);
      } else state.verifiedGone = event.gone;
    }
    return [...states.values()];
  }
}
