import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  type Authority,
  authoritySchema,
  digest,
  type Proposal,
  proposalSchema,
  type State,
} from './protocol';
import { SourceCoordinator, SourceReplica } from './replica';

let root: string;
let coordinator: SourceCoordinator;
let first: SourceReplica;
let second: SourceReplica;
let now: number;
let scope: State['scope'];
let auth1: Authority;
let auth2: Authority;
const open: { close(): void }[] = [];
function binding() {
  return {
    scope,
    identity: {
      machineId: randomUUID(),
      agentId: randomUUID(),
      sourceStoreId: randomUUID(),
      replicaId: randomUUID(),
    },
    grantId: randomUUID(),
    grantRevision: 1,
  };
}
function allow(value: ReturnType<typeof binding>): Authority {
  return authoritySchema.parse({
    ...value,
    decision: 'allowed',
    expiresAt: 100_000,
    capabilities: ['outcomes:read', 'planning:write', 'ownership:claim'],
  });
}
function send(proposal: Proposal, authority = auth1) {
  return coordinator.propose(
    proposal,
    () => authority,
    () => now
  );
}
function pull(replica: SourceReplica, authority: Authority) {
  const state = replica.snapshot();
  const page = coordinator.pull(
    state.binding,
    state.events.length,
    () => authority,
    now
  );
  return replica.applyPage(page, () => authority, now);
}
function proposal(
  replica: SourceReplica,
  id: string,
  command: Proposal['command']
) {
  return replica.propose(id, command, randomUUID());
}
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ttr-sync-source-')));
  now = 1000;
  scope = {
    principalId: randomUUID(),
    workspaceId: randomUUID(),
    projectId: randomUUID(),
    programId: 'synthetic-program',
  };
  const serverStoreId = randomUUID();
  const one = binding();
  const two = binding();
  auth1 = allow(one);
  auth2 = allow(two);
  SourceCoordinator.initialize(
    join(root, 'server.sqlite'),
    scope,
    serverStoreId
  );
  SourceReplica.initialize(join(root, 'one.sqlite'), one, serverStoreId);
  SourceReplica.initialize(join(root, 'two.sqlite'), two, serverStoreId);
  coordinator = new SourceCoordinator(join(root, 'server.sqlite'));
  first = new SourceReplica(join(root, 'one.sqlite'));
  second = new SourceReplica(join(root, 'two.sqlite'));
  open.push(coordinator, first, second);
});
afterEach(() => {
  for (const store of open.splice(0)) store.close();
  rmSync(root, { recursive: true, force: true });
});

it('preserves both disjoint outcomes across two persisted synthetic local replicas', () => {
  const a = randomUUID();
  const b = randomUUID();
  send(proposal(first, a, { kind: 'create', title: 'First' }));
  send(proposal(second, b, { kind: 'create', title: 'Second' }), auth2);
  pull(first, auth1);
  pull(second, auth2);
  expect(first.snapshot().outcomes.map((o) => o.title)).toEqual([
    'First',
    'Second',
  ]);
  expect(second.snapshot().events).toEqual(first.snapshot().events);
});
it('checks authority before dedupe; conflicting operation ID never appends', () => {
  const request = proposal(first, randomUUID(), {
    kind: 'create',
    title: 'Original',
  });
  const accepted = send(request);
  expect(send(request)).toEqual(accepted);
  expect(() =>
    send({ ...request, command: { kind: 'create', title: 'Changed' } })
  ).toThrow('operation_id_conflict');
  expect(() => send(request, { decision: 'denied' })).toThrow(
    'authority_unavailable'
  );
  expect(coordinator.snapshot().events).toHaveLength(1);
});
it('retains a stale proposal conflict and existing immutable history without overwriting', () => {
  const id = randomUUID();
  const stale = proposal(second, id, {
    kind: 'create',
    title: 'Other proposal',
  });
  send(proposal(first, id, { kind: 'create', title: 'Existing' }));
  const conflict = send(stale, auth2);
  expect(conflict).toMatchObject({
    kind: 'conflict',
    currentRevision: 1,
    proposed: { command: { title: 'Other proposal' } },
  });
  expect(send(stale, auth2)).toEqual(conflict);
  expect(coordinator.snapshot().events).toHaveLength(1);
  expect(coordinator.snapshot().outcomes[0]?.title).toBe('Existing');
});
it('fences old ownership after expiry/reassignment and preserves user-confirmed completion separately', () => {
  const id = randomUUID();
  send(proposal(first, id, { kind: 'create', title: 'Planning' }));
  pull(first, auth1);
  send(proposal(first, id, { kind: 'acquire', expectedFence: 0, ttlMs: 1000 }));
  pull(first, auth1);
  pull(second, auth2);
  expect(() =>
    send(
      proposal(second, id, {
        kind: 'plan',
        title: 'Stolen',
        completion: 'user-confirmed',
        fence: 1,
      }),
      auth2
    )
  ).toThrow('foreign_lease');
  now = 2001;
  send(
    proposal(second, id, { kind: 'acquire', expectedFence: 1, ttlMs: 1000 }),
    auth2
  );
  pull(first, auth1);
  pull(second, auth2);
  expect(() =>
    send(
      proposal(first, id, {
        kind: 'plan',
        title: 'Stale',
        completion: 'open',
        fence: 1,
      })
    )
  ).toThrow('foreign_lease');
  send(
    proposal(second, id, {
      kind: 'plan',
      title: 'Accepted',
      completion: 'user-confirmed',
      fence: 2,
    }),
    auth2
  );
  pull(first, auth1);
  expect(first.snapshot().outcomes[0]).toMatchObject({
    completion: 'user-confirmed',
    title: 'Accepted',
    fence: 2,
  });
});
it('never resurrects tombstones through old proposals or pull replay', () => {
  const id = randomUUID();
  send(proposal(first, id, { kind: 'create', title: 'Delete' }));
  pull(first, auth1);
  send(proposal(first, id, { kind: 'acquire', expectedFence: 0, ttlMs: 1000 }));
  pull(first, auth1);
  const old = proposal(first, id, {
    kind: 'plan',
    title: 'Offline old',
    completion: 'open',
    fence: 1,
  });
  send(proposal(first, id, { kind: 'tombstone', fence: 1 }));
  expect(send(old)).toMatchObject({ kind: 'conflict' });
  pull(first, auth1);
  pull(second, auth2);
  expect(() =>
    send(proposal(first, id, { kind: 'create', title: 'Resurrect' }))
  ).toThrow('tombstone_fence');
  expect(second.snapshot().outcomes[0]?.deleted).toBe(true);
});
it('atomically rolls back replica cursor/projection on interruption and replays after reopen', () => {
  send(proposal(first, randomUUID(), { kind: 'create', title: 'Durable' }));
  const page = coordinator.pull(first.snapshot().binding, 0, () => auth1, now);
  expect(() =>
    first.applyPage(
      page,
      () => auth1,
      now,
      () => {
        throw new Error('synthetic crash');
      }
    )
  ).toThrow('synthetic crash');
  expect(first.snapshot().events).toEqual([]);
  first.close();
  open.splice(open.indexOf(first), 1);
  first = new SourceReplica(join(root, 'one.sqlite'));
  open.push(first);
  expect(first.applyPage(page, () => auth1, now)).toEqual({
    cursor: 1,
    liveAuthenticationPerformed: false,
  });
  expect(first.applyPage(page, () => auth1, now).cursor).toBe(1);
});
it('rejects foreign/revoked/expired grants, injected credentials and evidence-verified status', () => {
  const request = proposal(first, randomUUID(), {
    kind: 'create',
    title: 'Scope',
  });
  expect(() => send(request, auth2)).toThrow('binding_mismatch');
  if (auth1.decision !== 'allowed')
    throw new Error('fixture authority missing');
  expect(() => send(request, { ...auth1, grantRevision: 2 })).toThrow(
    'binding_mismatch'
  );
  expect(() => send(request, { ...auth1, expiresAt: now })).toThrow(
    'authority_unavailable'
  );
  expect(() =>
    proposalSchema.parse({ ...request, credentials: 'synthetic-forbidden' })
  ).toThrow();
  expect(() =>
    proposalSchema.parse({
      ...request,
      command: {
        kind: 'plan',
        title: 'Unsafe',
        completion: 'evidence-verified',
        fence: 1,
      },
    })
  ).toThrow();
  expect(coordinator.snapshot().events).toEqual([]);
});
it('rejects hash tampering, cursor gaps, foreign store and replay mutation without writes', () => {
  send(proposal(first, randomUUID(), { kind: 'create', title: 'Original' }));
  const page = coordinator.pull(first.snapshot().binding, 0, () => auth1, now);
  const before = readFileSync(join(root, 'one.sqlite'));
  expect(() =>
    first.applyPage({ ...page, serverStoreId: randomUUID() }, () => auth1, now)
  ).toThrow('foreign_page');
  expect(() =>
    first.applyPage(
      { ...page, afterCursor: 1, nextCursor: 2 },
      () => auth1,
      now
    )
  ).toThrow('cursor_gap');
  const event = page.events[0];
  if (!event) throw new Error('fixture event missing');
  expect(() =>
    first.applyPage(
      { ...page, events: [{ ...event, at: 42 }] },
      () => auth1,
      now
    )
  ).toThrow('hash_mismatch');
  expect(readFileSync(join(root, 'one.sqlite'))).toEqual(before);
  first.applyPage(page, () => auth1, now);
  const { hash: _hash, ...body } = event;
  const changed = { ...body, at: 1001 };
  expect(() =>
    first.applyPage(
      { ...page, events: [{ ...changed, hash: digest(changed) }] },
      () => auth1,
      now
    )
  ).toThrow('replay_conflict');
});

it('rejects a rehashed event whose projection contradicts the declared command', () => {
  send(proposal(first, randomUUID(), { kind: 'create', title: 'Declared' }));
  const page = coordinator.pull(first.snapshot().binding, 0, () => auth1, now);
  const event = page.events[0];
  if (!event) throw new Error('fixture event missing');
  const { hash: _hash, ...body } = event;
  const altered = {
    ...body,
    outcome: { ...body.outcome, title: 'Forged projection' },
  };
  expect(() =>
    first.applyPage(
      { ...page, events: [{ ...altered, hash: digest(altered) }] },
      () => auth1,
      now
    )
  ).toThrow('transition_mismatch');
  expect(first.snapshot().events).toEqual([]);
});

it('renews/releases only current ownership and rejects unavailable capability/clock', () => {
  const id = randomUUID();
  send(proposal(first, id, { kind: 'create', title: 'Lease' }));
  pull(first, auth1);
  send(proposal(first, id, { kind: 'acquire', expectedFence: 0, ttlMs: 1000 }));
  pull(first, auth1);
  now = 1500;
  send(proposal(first, id, { kind: 'renew', fence: 1, ttlMs: 2000 }));
  pull(first, auth1);
  expect(coordinator.snapshot().outcomes[0]?.lease?.expiresAt).toBe(3500);
  send(proposal(first, id, { kind: 'release', fence: 1 }));
  pull(first, auth1);
  expect(coordinator.snapshot().outcomes[0]?.lease).toBe(null);
  expect(() =>
    send(
      proposal(first, id, {
        kind: 'plan',
        title: 'Released',
        completion: 'open',
        fence: 1,
      })
    )
  ).toThrow('foreign_lease');
  if (auth1.decision !== 'allowed')
    throw new Error('fixture authority missing');
  expect(() =>
    send(proposal(first, randomUUID(), { kind: 'create', title: 'Denied' }), {
      ...auth1,
      capabilities: ['outcomes:read'],
    })
  ).toThrow('authority_unavailable');
  now = 1499;
  expect(() =>
    send(proposal(first, randomUUID(), { kind: 'create', title: 'Clock' }))
  ).toThrow('clock_regressed');
});

it('rejects corrupted persisted dedupe receipts after reopen instead of replaying false success', () => {
  const request = proposal(first, randomUUID(), {
    kind: 'create',
    title: 'Receipt',
  });
  send(request);
  const state = coordinator.snapshot();
  const operation = state.operations[0];
  if (operation?.receipt.kind !== 'accepted')
    throw new Error('fixture receipt missing');
  operation.receipt.event.hash = '0'.repeat(64);
  coordinator.db
    .prepare('UPDATE state SET payload=? WHERE id=1')
    .run(JSON.stringify(state));
  coordinator.close();
  open.splice(open.indexOf(coordinator), 1);
  coordinator = new SourceCoordinator(join(root, 'server.sqlite'));
  open.push(coordinator);
  expect(() => send(request)).toThrow();
});

it.each(['duplicate', 'missing', 'hash', 'id'] as const)(
  'rejects %s operation history without replay',
  (mutation) => {
    const request = proposal(first, randomUUID(), {
      kind: 'create',
      title: 'Audit',
    });
    send(request);
    const state = coordinator.snapshot();
    const operation = state.operations[0];
    if (!operation) throw new Error('fixture missing');
    if (mutation === 'duplicate')
      state.operations.push(structuredClone(operation));
    if (mutation === 'missing') state.operations = [];
    if (mutation === 'hash') operation.hash = '0'.repeat(64);
    if (mutation === 'id') operation.operationId = randomUUID();
    coordinator.db
      .prepare('UPDATE state SET payload=? WHERE id=1')
      .run(JSON.stringify(state));
    expect(() => send(request)).toThrow();
  }
);

it('rejects corrupted conflict ancestry without overwriting retained proposals', () => {
  const id = randomUUID();
  const stale = proposal(second, id, { kind: 'create', title: 'Proposed' });
  send(proposal(first, id, { kind: 'create', title: 'Existing' }));
  send(stale, auth2);
  const state = coordinator.snapshot();
  const operation = state.operations.find(
    (o) => o.operationId === stale.operationId
  );
  if (operation?.receipt.kind !== 'conflict')
    throw new Error('fixture conflict missing');
  operation.receipt.currentHash = '0'.repeat(64);
  coordinator.db
    .prepare('UPDATE state SET payload=? WHERE id=1')
    .run(JSON.stringify(state));
  expect(() => send(stale, auth2)).toThrow('conflict_ancestry_mismatch');
});
