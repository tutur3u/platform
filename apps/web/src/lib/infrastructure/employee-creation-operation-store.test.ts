import { describe, expect, it } from 'vitest';
import { createEmployeeCreationJournal } from './employee-creation-journal';
import {
  createEmployeeCreationOperationStore,
  type EmployeeCreationOperationRpc,
  type EmployeeOperationAuthority,
  type EmployeeOperationIdentity,
  type EmployeeOperationSnapshot,
  type EmployeePhaseReceipt,
} from './employee-creation-operation-store';
import {
  createEmployeeStoreTestPhaseFixture,
  type Identity,
  type Ports,
  type Sql,
  type User,
} from './employee-creation-operation-store.test-fixture';

const actor = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const target = '33333333-3333-4333-8333-333333333333';
const lease = '44444444-4444-4444-8444-444444444444';
const identity = {
  actorUserId: actor,
  operationId,
  email: 'new@tuturuuu.com',
  displayName: 'New',
};
const snapshot: EmployeeOperationSnapshot = {
  ...identity,
  targetUserId: target,
  phase: 'reserved',
  version: 0,
  leaseId: lease,
  leaseExpiresAt: 61000,
  revoked: false,
  lastReceipt: null,
};
const authority: EmployeeOperationAuthority = {
  actorUserId: actor,
  workspaceId: '00000000-0000-0000-0000-000000000000',
  membership: 'MEMBER',
  permission: 'admin',
  email: 'admin@tuturuuu.com',
  emailConfirmed: true,
  unbanned: true,
  observedAt: 1000,
  expiresAt: 61000,
};
function fixture() {
  let proof: unknown = authority;
  let response: unknown = { kind: 'claimed', operation: snapshot };
  let calls = 0;
  const rpc: EmployeeCreationOperationRpc = {
    async ready() {
      calls++;
      return { ready: true };
    },
    async claim() {
      calls++;
      return response;
    },
    async advance() {
      calls++;
      return response;
    },
    async revoke() {
      calls++;
      return response;
    },
  };
  const store = createEmployeeCreationOperationStore({
    rpc,
    now: () => 1000,
    async authorize() {
      return proof;
    },
  });
  return {
    store,
    proof(value: unknown) {
      proof = value;
    },
    response(value: unknown) {
      response = value;
    },
    calls: () => calls,
  };
}
describe('employee operation store private boundary', () => {
  it.each([
    null,
    { ...authority, actorUserId: target },
    { ...authority, membership: 'GUEST' },
    { ...authority, workspaceId: target },
    { ...authority, permission: 'read' },
    { ...authority, email: 'admin@example.com' },
    { ...authority, unbanned: false },
    { ...authority, emailConfirmed: false },
    { ...authority, observedAt: 1001 },
    { ...authority, expiresAt: 1000 },
    { ...authority, expiresAt: 61001 },
    { ...authority, extra: true },
  ])(
    'denies stale/wrong authority before any private RPC: %j',
    async (proof) => {
      const f = fixture();
      f.proof(proof);
      expect(await f.store.available(actor)).toBe(false);
      await expect(f.store.claim(identity)).rejects.toMatchObject({
        code: 'authority_denied',
      });
      await expect(
        f.store.advance(snapshot, 'auth_attempted', null, target)
      ).rejects.toMatchObject({
        code: 'authority_denied',
        lastKnown: snapshot,
      });
      await expect(f.store.revoke(snapshot)).rejects.toMatchObject({
        code: 'authority_denied',
      });
      expect(f.calls()).toBe(0);
    }
  );
  it('accepts exact bound DTO and fresh root authority', async () => {
    const f = fixture();
    expect(await f.store.available(actor)).toBe(true);
    expect(await f.store.claim(identity)).toEqual({
      kind: 'claimed',
      operation: snapshot,
    });
  });
  it.each([
    { ...snapshot, password: 'secret' },
    { ...snapshot, actorUserId: target },
    { ...snapshot, operationId: target },
    { ...snapshot, email: 'other@tuturuuu.com' },
    { ...snapshot, targetUserId: 'not-uuid' },
    { ...snapshot, phase: 'unexpected' },
    { ...snapshot, leaseExpiresAt: 1000 },
    { ...snapshot, revoked: true },
    { ...snapshot, leaseId: null },
  ])(
    'rejects malformed, misbound and non-executable claims',
    async (operation) => {
      const f = fixture();
      f.response({ kind: 'claimed', operation });
      await expect(f.store.claim(identity)).rejects.toMatchObject({
        code: 'invalid_receipt',
      });
    }
  );
  it('does not mistake CAS denial for transition success', async () => {
    const f = fixture();
    f.response({ kind: 'inspect', operation: snapshot });
    expect(
      await f.store.advance(snapshot, 'auth_attempted', null, target)
    ).toEqual({ kind: 'inspect', operation: snapshot });
  });
  it('rejects claimed advanced receipt with wrong version/target', async () => {
    const f = fixture();
    for (const operation of [
      { ...snapshot, phase: 'auth_attempted', version: 2 },
      { ...snapshot, phase: 'auth_attempted', version: 1, targetUserId: lease },
    ]) {
      f.response({ kind: 'advanced', operation });
      await expect(
        f.store.advance(snapshot, 'auth_attempted', null, target)
      ).rejects.toMatchObject({ code: 'invalid_receipt', lastKnown: snapshot });
    }
  });
});

const receipt: EmployeePhaseReceipt = {
  targetUserId: target,
  email: identity.email,
  providerReceiptId: lease,
  authConfirmed: true,
  authPending: true,
  providerActive: false,
  sqlConfirmed: false,
  profilesConfirmed: false,
  mailboxConfirmed: false,
  grantsConfirmed: false,
};
describe('advanced causal acknowledgement binding', () => {
  it.each([
    { leaseId: target },
    { leaseExpiresAt: 62000 },
    { revoked: true },
    { lastReceipt: null },
    { lastReceipt: { ...receipt, providerReceiptId: target } },
    { lastReceipt: { ...receipt, authConfirmed: false } },
  ])(
    'causal advanced reply must acknowledge the original lease and exact submitted receipt %j',
    async (fault) => {
      const f = fixture();
      const before = {
        ...snapshot,
        phase: 'auth_attempted' as const,
        version: 1,
      };
      f.response({
        kind: 'advanced',
        operation: {
          ...before,
          phase: 'auth_confirmed',
          version: 2,
          lastReceipt: receipt,
          ...fault,
        },
      });
      await expect(
        f.store.advance(before, 'auth_confirmed', receipt, target)
      ).rejects.toMatchObject({
        code: 'invalid_receipt',
        lastKnown: before,
      });
    }
  );
  it.each([
    null,
    { ...receipt, providerReceiptId: target },
    { ...receipt, grantsConfirmed: true },
  ])(
    'causal null mark must preserve the exact prior receipt',
    async (changed) => {
      const f = fixture();
      const before = {
        ...snapshot,
        phase: 'auth_confirmed' as const,
        version: 2,
        lastReceipt: receipt,
      };
      f.response({
        kind: 'advanced',
        operation: {
          ...before,
          phase: 'finalize_attempted',
          version: 3,
          lastReceipt: changed,
        },
      });
      await expect(
        f.store.advance(before, 'finalize_attempted', null, target)
      ).rejects.toMatchObject({
        code: 'invalid_receipt',
        lastKnown: before,
      });
    }
  );
  it('positive null mark preserves the exact known receipt', async () => {
    const f = fixture();
    const before = {
      ...snapshot,
      phase: 'auth_confirmed' as const,
      version: 2,
      lastReceipt: receipt,
    };
    const operation = { ...before, phase: 'finalize_attempted', version: 3 };
    f.response({ kind: 'advanced', operation });
    expect(
      await f.store.advance(before, 'finalize_attempted', null, target)
    ).toEqual({ kind: 'advanced', operation });
  });
  it('legitimate newer inspect is accepted without becoming dispatch permission', async () => {
    const f = fixture();
    const operation = {
      ...snapshot,
      phase: 'unknown',
      version: 5,
      leaseId: target,
      leaseExpiresAt: 62000,
      revoked: true,
      lastReceipt: receipt,
    };
    f.response({ kind: 'inspect', operation });
    expect(
      await f.store.advance(snapshot, 'auth_attempted', null, target)
    ).toEqual({ kind: 'inspect', operation });
  });
});

describe('fresh authoritative effect admission', () => {
  const attempted: EmployeeOperationSnapshot = {
    ...snapshot,
    phase: 'auth_attempted',
    version: 1,
  };
  it('returns the exact fresh attempted snapshot after actor authorization', async () => {
    const f = fixture();
    f.response({ kind: 'inspect', operation: attempted });
    expect(await f.store.assertAuthority(attempted)).toEqual(attempted);
    expect(f.calls()).toBe(1);
  });
  it.each([
    { revoked: true },
    { leaseId: target },
    { leaseId: null },
    { leaseExpiresAt: 1000 },
    { leaseExpiresAt: 62000 },
    { version: 2 },
    { phase: 'unknown' },
    { lastReceipt: receipt },
  ])(
    'fresh changed or nonlive inspection never admits an effect %j',
    async (changed) => {
      const f = fixture();
      const current = { ...attempted, ...changed };
      f.response({ kind: 'inspect', operation: current });
      await expect(f.store.assertAuthority(attempted)).rejects.toMatchObject({
        code: 'unavailable',
        lastKnown: current,
      });
    }
  );
  it.each([
    { kind: 'claimed', operation: attempted },
    { kind: 'inspect', operation: { ...attempted, password: 'never-persist' } },
    { kind: 'inspect', operation: { ...attempted, actorUserId: target } },
    {
      kind: 'inspect',
      operation: { ...attempted, email: 'different@tuturuuu.com' },
    },
  ])(
    'misbound or malformed admission receipt preserves the prior snapshot',
    async (response) => {
      const f = fixture();
      f.response(response);
      await expect(f.store.assertAuthority(attempted)).rejects.toMatchObject({
        code: 'invalid_receipt',
        lastKnown: attempted,
      });
    }
  );
});

describe('actor proof survives the locked inspection wait only while fresh', () => {
  it.each([
    { label: 'live', after: 1500, allowed: true },
    { label: 'exact expiry', after: 2000, allowed: false },
    { label: 'expired before lease', after: 3000, allowed: false },
    { label: 'NaN', after: Number.NaN, allowed: false },
    {
      label: 'positive infinity',
      after: Number.POSITIVE_INFINITY,
      allowed: false,
    },
    {
      label: 'negative infinity',
      after: Number.NEGATIVE_INFINITY,
      allowed: false,
    },
    { label: 'clock before observation', after: 900, allowed: false },
  ])(
    'causal delayed claim with $label actor proof',
    async ({ after, allowed }) => {
      let clock = 1000;
      const actorRows = new Map([
        [
          actor,
          { email: 'admin@tuturuuu.com', confirmed: true, banned: false },
        ],
      ]);
      const rootMembers = new Set([actor]);
      const rootAdmins = new Set([actor]);
      const rows = new Map<string, EmployeeOperationSnapshot>();
      const intents = new Map<string, typeof identity>();
      const history: string[] = [];
      const events = new Map<string, string>();
      const phases: string[] = [];
      let held = false;
      let enter: () => void = () => {};
      let release: () => void = () => {};
      const entered = new Promise<void>((resolve) => {
        enter = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      function proof(userId: string) {
        const user = actorRows.get(userId);
        if (
          !user?.confirmed ||
          user.banned ||
          !user.email.endsWith('@tuturuuu.com') ||
          !rootMembers.has(userId) ||
          !rootAdmins.has(userId)
        )
          return null;
        return {
          ...authority,
          actorUserId: userId,
          email: user.email,
          expiresAt: 2000,
        };
      }
      function requireActor(userId: string) {
        if (!proof(userId)) throw new Error('fixture SQL authority denied');
      }
      function current() {
        const value = rows.get(operationId);
        if (!value) throw new Error('missing fixture row');
        return value;
      }
      const rpc: EmployeeCreationOperationRpc = {
        async ready(userId) {
          requireActor(userId);
          return { ready: true };
        },
        async claim(value) {
          requireActor(value.actorUserId);
          if (!rows.has(operationId)) {
            rows.set(operationId, { ...snapshot, ...value });
            intents.set(target, value);
            return { kind: 'claimed', operation: structuredClone(current()) };
          }
          if (current().phase === 'auth_attempted' && !held) {
            held = true;
            enter();
            await gate;
          }
          return { kind: 'inspect', operation: structuredClone(current()) };
        },
        async advance(value) {
          requireActor(value.actorUserId);
          const row = current();
          if (
            events.has(value.eventId) ||
            row.revoked ||
            row.version !== value.expectedVersion ||
            row.leaseId !== value.leaseId
          )
            return { kind: 'inspect', operation: structuredClone(row) };
          const graph: Record<string, string> = {
            reserved: 'auth_attempted',
            auth_attempted: 'auth_confirmed',
            auth_confirmed: 'finalize_attempted',
            finalize_attempted: 'provisioned',
            provisioned: 'activation_attempted',
            activation_attempted: 'active',
          };
          if (
            value.nextPhase !== 'unknown' &&
            graph[row.phase] !== value.nextPhase
          )
            throw new Error('fixture transition denied');
          events.set(value.eventId, value.nextPhase);
          rows.set(operationId, {
            ...row,
            phase: value.nextPhase,
            version: row.version + 1,
            lastReceipt: value.receipt ?? row.lastReceipt,
          });
          history.push(value.nextPhase);
          return { kind: 'advanced', operation: structuredClone(current()) };
        },
        async revoke(value) {
          requireActor(value.actorUserId);
          rows.set(operationId, { ...current(), revoked: true });
          return structuredClone(current());
        },
      };
      let authorizations = 0;
      let countAtInspection = 0;
      const store = createEmployeeCreationOperationStore({
        rpc,
        now: () => clock,
        async authorize(userId) {
          authorizations++;
          return proof(userId);
        },
      });
      const provider = createEmployeeStoreTestPhaseFixture({
        current,
        now: () => clock,
        actorProof: proof,
        ports: createEmployeeStoreTestPorts({
          intent: (id) => intents.get(id),
        }),
        onEffect(name, operation) {
          if (name === 'auth') {
            expect(operation.targetUserId).toBe(target);
            expect(authorizations).toBe(countAtInspection);
          }
          phases.push(name);
        },
      });
      const journal = createEmployeeCreationJournal({ store, provider });
      const first = journal
        .claimAndRun({
          actorUserId: actor,
          operationId,
          payload: {
            email: identity.email,
            displayName: identity.displayName,
            temporaryPassword: 'transient-test-password',
          },
        })
        .then(
          (value) => ({ kind: 'success' as const, value }),
          (error) => ({ kind: 'failure' as const, error })
        );
      async function bounded<T>(value: Promise<T>) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            value,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('fixture wait/drain deadline')),
                1000
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
      try {
        await bounded(
          Promise.race([
            entered,
            first.then((result) => {
              if (result.kind === 'failure') throw result.error;
              throw new Error('operation completed before locked inspection');
            }),
          ])
        );
        expect(current()).toMatchObject({
          phase: 'auth_attempted',
          version: 1,
          revoked: false,
          leaseExpiresAt: 61000,
        });
        countAtInspection = authorizations;
        clock = after;
      } finally {
        release();
        await bounded(first);
      }
      expect(await first).toMatchObject({
        kind: 'success',
        value: {
          targetUserId: target,
          outcome: { status: allowed ? 'created' : 'pending' },
        },
      });
      expect(phases).toEqual(allowed ? ['auth', 'finalize', 'activate'] : []);
      expect(intents.get(target)).toEqual(identity);
      expect(current().targetUserId).toBe(target);
      if (!allowed) {
        expect(history).toEqual(['auth_attempted']);
        // Journal's stopped-phase unknown recording still authorizes; the admission
        // correction itself adds no actor await. Independently exercise that gate.
        let directCalls = 0;
        let directClock = 1000;
        const direct = createEmployeeCreationOperationStore({
          rpc: {
            ...rpc,
            async claim() {
              directClock = after;
              return { kind: 'inspect', operation: structuredClone(current()) };
            },
          },
          now: () => directClock,
          async authorize(userId) {
            directCalls++;
            return proof(userId);
          },
        });
        await expect(direct.assertAuthority(current())).rejects.toMatchObject({
          code: 'authority_denied',
          lastKnown: current(),
        });
        expect(directCalls).toBe(1);
      }
      expect(countAtInspection).toBeGreaterThan(0);
    }
  );
});

/** In-memory transaction/Auth model only; no SQL or provider is contacted. */
function createEmployeeStoreTestPorts(input: {
  intent(target: string): EmployeeOperationIdentity | undefined;
}): Ports {
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  const users = new Map<string, User>();
  const profiles = new Map<string, { email: string; displayName: string }>();
  const privateProfiles = new Map<
    string,
    { email: string; displayName: string }
  >();
  const mailboxes = new Map<string, string>();
  const grants = new Map<string, Set<string>>();
  const committed = new Map<string, Sql>();
  function records(value: Identity) {
    const profile = { email: value.email, displayName: value.displayName };
    return {
      profiles:
        same(profiles.get(value.targetUserId), profile) &&
        same(privateProfiles.get(value.targetUserId), profile),
      mailbox: mailboxes.get(value.targetUserId) === value.email,
      grants:
        grants.has(value.targetUserId) &&
        grants.get(value.targetUserId)?.size === 0,
    };
  }
  return {
    records,
    auth: {
      async create(value) {
        if (
          users.has(value.targetUserId) ||
          value.temporaryPassword.length < 12
        )
          throw new Error('fixture Auth create denied');
        const user: User = {
          id: value.targetUserId,
          email: value.email,
          email_confirmed_at: '1970-01-01T00:00:00Z',
          banned_until: '2126-01-01T00:00:00Z',
          app_metadata: { employee_onboarding: true },
        };
        users.set(user.id, user);
        return structuredClone(user);
      },
      async activate(value) {
        const user = users.get(value.targetUserId);
        if (!user || user.email !== value.email)
          throw new Error('fixture Auth missing');
        const active = { ...user, banned_until: null };
        users.set(user.id, active);
        return structuredClone(users.get(user.id));
      },
    },
    async transaction(value, phase) {
      const intent = input.intent(value.targetUserId);
      const expected = {
        actorUserId: value.actorUserId,
        operationId: value.operationId,
        email: value.email,
        displayName: value.displayName,
      };
      if (!same(intent, expected))
        throw new Error('fixture reserved intent mismatch');
      if (phase === 'preflight') return structuredClone(intent);
      const user = users.get(value.targetUserId);
      if (!user || user.email !== value.email)
        throw new Error('fixture Auth missing');
      if (phase === 'finalize') {
        if (!user.banned_until || committed.has(user.id))
          throw new Error('fixture pending required');
        const profile = { email: value.email, displayName: value.displayName };
        profiles.set(user.id, profile);
        privateProfiles.set(user.id, { ...profile });
        mailboxes.set(user.id, value.email);
        grants.set(user.id, new Set());
      } else if (
        user.banned_until ||
        committed.get(user.id)?.status !== 'pending'
      ) {
        throw new Error('fixture activation fence');
      }
      const facts = records(value);
      if (!facts.profiles || !facts.mailbox || !facts.grants)
        throw new Error('fixture invariants missing');
      const receipt: Sql = {
        id: user.id,
        email: user.email,
        displayName: value.displayName,
        status: phase === 'finalize' ? 'pending' : 'created',
      };
      committed.set(user.id, receipt);
      return structuredClone(committed.get(user.id));
    },
  };
}
