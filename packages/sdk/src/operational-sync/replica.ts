import { closeSync, constants, fstatSync, lstatSync, openSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  exclusiveFile,
  MAX_BYTES,
  privateParent,
  safePath,
} from '../cli/operational-files';
import {
  applyProposal,
  initialState,
  projectOutcome,
  validateOperationHistory,
} from './engine';
import {
  type Authority,
  bindingSchema,
  canonical,
  fail,
  type outcomeSchema,
  type Page,
  pageSchema,
  proposalSchema,
  requireAuthority,
  type State,
  stateSchema,
  verifyEvent,
} from './protocol';

const rowSchema = z.object({ payload: z.string() });
const replicaSchema = z
  .object({
    binding: bindingSchema,
    serverStoreId: z.uuid(),
    events: stateSchema.shape.events,
    outcomes: stateSchema.shape.outcomes,
  })
  .strict();
type ReplicaState = z.infer<typeof replicaSchema>;
function validateChain(
  events: State['events'],
  scope: State['scope'],
  serverStoreId: string
) {
  const outcomes = new Map<string, z.infer<typeof outcomeSchema>>();
  let previous: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const event = verifyEvent(events[i]);
    const prior = outcomes.get(event.outcome.id);
    if (
      event.serverStoreId !== serverStoreId ||
      canonical(event.proposal.scope) !== canonical(scope) ||
      event.cursor !== i + 1 ||
      event.previousHash !== previous ||
      event.proposal.expectedRevision !== (prior?.revision ?? 0) ||
      event.proposal.previousOutcomeHash !== (prior?.lastHash ?? null)
    )
      fail('invalid_event_chain');
    if (event.at < (events[i - 1]?.at ?? 0)) fail('server_clock_regressed');
    if (
      canonical(projectOutcome(prior, event.proposal, event.at)) !==
      canonical(event.outcome)
    )
      fail('transition_mismatch');
    if (prior?.deleted) fail('tombstone_fence');
    outcomes.set(event.outcome.id, { ...event.outcome, lastHash: event.hash });
    previous = event.hash;
  }
  return [...outcomes.values()];
}
function sameProjection(left: State['outcomes'], right: State['outcomes']) {
  const ordered = (v: State['outcomes']) =>
    [...v].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return canonical(ordered(left)) === canonical(ordered(right));
}
class JsonStore {
  readonly db: DatabaseSync;
  private readonly fd: number;
  constructor(path: string) {
    const safe = safePath(path);
    this.fd = openSync(safe, constants.O_RDONLY | constants.O_NOFOLLOW);
    let opened: DatabaseSync | undefined;
    try {
      privateParent(safe);
      const before = fstatSync(this.fd);
      if (!before.isFile() || (before.mode & 0o077) !== 0)
        fail('private_store_required');
      opened = new DatabaseSync(safe);
      const after = lstatSync(safe);
      if (
        after.isSymbolicLink() ||
        before.ino !== after.ino ||
        before.dev !== after.dev
      )
        fail('store_path_changed');
      opened.exec('PRAGMA busy_timeout=1000');
      this.db = opened;
    } catch (error) {
      opened?.close();
      closeSync(this.fd);
      throw error;
    }
  }
  close() {
    this.db.close();
    closeSync(this.fd);
  }
  read(): unknown {
    return JSON.parse(
      rowSchema.parse(
        this.db.prepare('SELECT payload FROM state WHERE id=1').get()
      ).payload
    );
  }
  write(value: unknown) {
    const payload = canonical(value);
    if (Buffer.byteLength(payload) > MAX_BYTES) fail('store_capacity');
    this.db
      .prepare(
        'INSERT INTO state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload'
      )
      .run(payload);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
function initialize(path: string, state: unknown) {
  exclusiveFile(path);
  const db = new JsonStore(path);
  try {
    db.transaction(() => {
      db.db.exec(
        'CREATE TABLE state(id INTEGER PRIMARY KEY,payload TEXT NOT NULL)'
      );
      db.write(state);
    });
  } finally {
    db.close();
  }
}

// Source fixture adapter only. Authentication/grant lookup must be supplied by a
// reviewed server adapter; this class never authenticates requests or activates a service.
export class SourceCoordinator extends JsonStore {
  static initialize(
    path: string,
    scope: State['scope'],
    serverStoreId: string
  ) {
    initialize(path, initialState(scope, serverStoreId));
  }
  snapshot() {
    const state = stateSchema.parse(this.read());
    validateOperationHistory(state);
    if (
      !sameProjection(
        validateChain(state.events, state.scope, state.serverStoreId),
        state.outcomes
      )
    )
      fail('projection_conflict');
    return state;
  }
  propose(
    input: unknown,
    readAuthority: () => Authority,
    serverNow: () => number
  ) {
    return this.transaction(() => {
      const result = applyProposal(
        this.snapshot(),
        input,
        readAuthority(),
        serverNow()
      );
      this.write(result.state);
      return result.receipt;
    });
  }
  pull(
    binding: z.infer<typeof bindingSchema>,
    afterCursor: number,
    readAuthority: () => Authority,
    now: number
  ): Page {
    requireAuthority(readAuthority(), binding, 'outcomes:read', now);
    const state = this.snapshot();
    if (
      canonical(binding.scope) !== canonical(state.scope) ||
      !Number.isSafeInteger(afterCursor) ||
      afterCursor < 0 ||
      afterCursor > state.events.length
    )
      fail('foreign_cursor');
    const events = state.events.slice(afterCursor, afterCursor + 500);
    return pageSchema.parse({
      version: 1,
      binding,
      serverStoreId: state.serverStoreId,
      afterCursor,
      nextCursor: afterCursor + events.length,
      events,
    });
  }
}
export class SourceReplica extends JsonStore {
  static initialize(
    path: string,
    binding: z.infer<typeof bindingSchema>,
    serverStoreId: string
  ) {
    initialize(
      path,
      replicaSchema.parse({ binding, serverStoreId, events: [], outcomes: [] })
    );
  }
  snapshot(): ReplicaState {
    const state = replicaSchema.parse(this.read());
    if (
      !sameProjection(
        validateChain(state.events, state.binding.scope, state.serverStoreId),
        state.outcomes
      )
    )
      fail('projection_conflict');
    return state;
  }
  applyPage(
    input: unknown,
    readAuthority: () => Authority,
    now: number,
    beforeCommit?: () => void
  ) {
    const page = pageSchema.parse(input);
    return this.transaction(() => {
      const current = this.snapshot();
      requireAuthority(readAuthority(), current.binding, 'outcomes:read', now);
      if (
        page.serverStoreId !== current.serverStoreId ||
        canonical(page.binding) !== canonical(current.binding)
      )
        fail('foreign_page');
      if (
        page.nextCursor !== page.afterCursor + page.events.length ||
        page.afterCursor > current.events.length
      )
        fail('cursor_gap');
      const events = [...current.events];
      for (const event of page.events) {
        const existing = events[event.cursor - 1];
        if (existing) {
          if (canonical(existing) !== canonical(event))
            fail('event_replay_conflict');
        } else {
          if (event.cursor !== events.length + 1) fail('cursor_gap');
          events.push(event);
        }
      }
      if (page.events.some((e, i) => e.cursor !== page.afterCursor + i + 1))
        fail('cursor_gap');
      const outcomes = validateChain(
        events,
        current.binding.scope,
        current.serverStoreId
      );
      const next = replicaSchema.parse({ ...current, events, outcomes });
      this.write(next);
      beforeCommit?.();
      return { cursor: next.events.length, liveAuthenticationPerformed: false };
    });
  }
  propose(
    outcomeId: string,
    command: z.infer<typeof proposalSchema>['command'],
    operationId: string
  ) {
    const state = this.snapshot();
    const outcome = state.outcomes.find((o) => o.id === outcomeId);
    return proposalSchema.parse({
      ...state.binding,
      version: 1,
      operationId,
      outcomeId,
      expectedRevision: outcome?.revision ?? 0,
      previousOutcomeHash: outcome?.lastHash ?? null,
      command,
    });
  }
}
