import { describe, expect, it } from 'vitest';
import {
  createEmployeeCreationJournal,
  type EmployeeCreationPhaseProvider,
} from './employee-creation-journal';
import {
  createEmployeeCreationOperationStore,
  type EmployeeCreationOperationRpc,
  type EmployeeOperationAdvance,
  type EmployeeOperationIdentity,
  type EmployeeOperationSnapshot,
  EmployeeOperationSnapshotSchema,
  type EmployeePhaseReceipt,
  EmployeePhaseReceiptSchema,
} from './employee-creation-operation-store';

const actor = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const target = '33333333-3333-4333-8333-333333333333';
const lease = '44444444-4444-4444-8444-444444444444';
const receiptId = '55555555-5555-4555-8555-555555555555';
const payload = {
  email: 'new@tuturuuu.com',
  displayName: 'New Employee',
  temporaryPassword: 'transient-only-password',
};
const identity = {
  actorUserId: actor,
  operationId,
  email: payload.email,
  displayName: payload.displayName,
};
function signal() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function observe(operation: Promise<unknown>) {
  return operation.then(
    (value) => ({ kind: 'success' as const, value }),
    (error) => ({ kind: 'failure' as const, error })
  );
}
async function bounded<T>(promise: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('fixture deadline exceeded')),
          1000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function admitted(
  entered: Promise<void>,
  first: ReturnType<typeof observe>
) {
  await bounded(
    Promise.race([
      entered,
      first.then((result) => {
        if (result.kind === 'failure') throw result.error;
        throw new Error('operation completed before admission');
      }),
    ])
  );
}
/** Persistent transaction fixture shared across fresh journal instances. No provider,
 * SQL application or production persistence claim is made by this fixture. */
function fixture() {
  let row: EmployeeOperationSnapshot | null = null;
  const history = new Map<string, EmployeeOperationAdvance>();
  const intents = new Map<string, EmployeeOperationIdentity>();
  const actors = new Map([
    [actor, { email: 'admin@tuturuuu.com', confirmed: true, banned: false }],
  ]);
  const rootMembers = new Set([actor]);
  const rootAdmins = new Set([actor]);
  function authority(userId: string) {
    const user = actors.get(userId);
    if (
      !user?.confirmed ||
      user.banned ||
      !user.email.endsWith('@tuturuuu.com') ||
      !rootMembers.has(userId) ||
      !rootAdmins.has(userId)
    )
      return null;
    return {
      actorUserId: userId,
      workspaceId: '00000000-0000-0000-0000-000000000000',
      membership: 'MEMBER',
      permission: 'admin',
      email: user.email,
      emailConfirmed: true,
      unbanned: true,
      observedAt: time,
      expiresAt: time + 60000,
    };
  }
  function requireActor(userId: string) {
    if (!authority(userId)) throw new Error('fixture authority denied');
  }
  let authorizationHold: {
    phase: EmployeeOperationSnapshot['phase'];
    entered: ReturnType<typeof signal>;
    release: ReturnType<typeof signal>;
  } | null = null;
  const providerEntered = signal();
  const providerRelease = signal();
  let providerHeld = false;
  let time = 1000;
  let creates = 0;
  let finalizes = 0;
  let activates = 0;
  let fail: 'auth' | 'finalize' | 'activate' | 'receipt' | 'none' = 'none';
  let revokeAfterAuth = false;
  let lostAuthMark = false;
  let casDenied = false;
  let ackFault: {
    phase: EmployeeOperationSnapshot['phase'];
    mutate(value: EmployeeOperationSnapshot): EmployeeOperationSnapshot;
  } | null = null;
  const rpc: EmployeeCreationOperationRpc = {
    async ready(userId) {
      requireActor(userId);
      return { ready: true };
    },
    async claim(value) {
      requireActor(value.actorUserId);
      if (row)
        return {
          kind:
            value.email !== row.email || value.displayName !== row.displayName
              ? 'payload_conflict'
              : 'inspect',
          operation: structuredClone(row),
        };
      row = {
        ...value,
        targetUserId: target,
        phase: 'reserved',
        version: 0,
        leaseId: lease,
        leaseExpiresAt: 61000,
        revoked: false,
        lastReceipt: null,
      };
      intents.set(target, value);
      return { kind: 'claimed', operation: structuredClone(row) };
    },
    async advance(value) {
      requireActor(value.actorUserId);
      if (!row) throw new Error('missing');
      if (
        row.version !== value.expectedVersion ||
        row.leaseId !== value.leaseId ||
        row.revoked ||
        time >= row.leaseExpiresAt ||
        casDenied
      )
        return { kind: 'inspect', operation: structuredClone(row) };
      if (history.has(value.eventId))
        return { kind: 'inspect', operation: structuredClone(row) };
      history.set(value.eventId, structuredClone(value));
      row = {
        ...row,
        phase: value.nextPhase,
        version: row.version + 1,
        lastReceipt: value.receipt ?? row.lastReceipt,
      };
      if (lostAuthMark && value.nextPhase === 'auth_attempted')
        throw new Error('committed reply lost');
      const reply = structuredClone(row);
      if (ackFault?.phase === reply.phase) {
        const fault = ackFault;
        ackFault = null;
        return { kind: 'advanced', operation: fault.mutate(reply) };
      }
      return { kind: 'advanced', operation: reply };
    },
    async revoke(value) {
      requireActor(value.actorUserId);
      if (!row) throw new Error('missing');
      row.revoked = true;
      return structuredClone(row);
    },
  };
  function receipt(active: boolean, sql: boolean): EmployeePhaseReceipt {
    return {
      targetUserId: target,
      email: payload.email,
      providerReceiptId: target,
      authConfirmed: true,
      authPending: !active,
      providerActive: active,
      sqlConfirmed: sql,
      profilesConfirmed: sql,
      mailboxConfirmed: sql,
      grantsConfirmed: sql,
    };
  }
  const provider: EmployeeCreationPhaseProvider = {
    async available() {
      return true;
    },
    async createPending(value) {
      creates++;
      expect(value.operation.phase).toBe('auth_attempted');
      expect(row?.phase).toBe('auth_attempted');
      expect(value.operation.targetUserId).toBe(target);
      expect(intents.get(target)).toEqual(identity);
      expect(value.temporaryPassword).toBe(payload.temporaryPassword);
      providerEntered.resolve();
      if (providerHeld) await providerRelease.promise;
      if (fail === 'auth') throw new Error('provider response lost');
      if (revokeAfterAuth) rootAdmins.delete(actor);
      if (fail === 'receipt')
        return { ...receipt(false, false), targetUserId: lease };
      return receipt(false, false);
    },
    async finalize(value) {
      finalizes++;
      expect(value.operation.phase).toBe('finalize_attempted');
      expect(row?.phase).toBe('finalize_attempted');
      if (fail === 'finalize') throw new Error('SQL outcome lost');
      return receipt(false, true);
    },
    async activateAndConfirm(value) {
      activates++;
      expect(value.operation.phase).toBe('activation_attempted');
      expect(row?.phase).toBe('activation_attempted');
      if (fail === 'activate') throw new Error('activation outcome lost');
      return receipt(true, true);
    },
  };
  const store = createEmployeeCreationOperationStore({
    rpc,
    now: () => time,
    async authorize(userId) {
      const hold = authorizationHold;
      if (hold && row?.phase === hold.phase) {
        authorizationHold = null;
        hold.entered.resolve();
        await hold.release.promise;
      }
      return authority(userId);
    },
  });
  provider.beginInvocation = ({ store: bound, operation }) => {
    let current = operation;
    const caps = new WeakMap<
      object,
      { operation: EmployeeOperationSnapshot; handed: boolean; used: boolean }
    >();
    async function phase(
      input: { operation: EmployeeOperationSnapshot; capability: object },
      kind: 'auth' | 'finalize' | 'activate',
      password?: string
    ) {
      const cap = caps.get(input.capability);
      if (!cap?.handed || cap.used) return { kind: 'denied' as const };
      cap.used = true;
      try {
        await bound.assertAuthority(cap.operation);
        const raw =
          kind === 'auth'
            ? await provider.createPending({
                operation: input.operation,
                temporaryPassword: password ?? '',
              })
            : kind === 'finalize'
              ? await provider.finalize(input)
              : await provider.activateAndConfirm(input);
        const receipt = EmployeePhaseReceiptSchema.parse(raw);
        return {
          kind: 'qualified' as const,
          receipt,
          facts: [
            {
              kind: 'auth' as const,
              resourceId: receipt.targetUserId,
              email: receipt.email,
              state: receipt.providerActive
                ? ('active' as const)
                : ('banned' as const),
              confirmedAt: '1970-01-01T00:00:00Z',
              onboarding: true as const,
            },
          ],
        };
      } catch {
        return { kind: 'unknown' as const };
      }
    }
    return {
      async advance(next, receipt, event) {
        const result = await bound.advance(current, next, receipt, event);
        current = result.operation;
        const capability =
          result.kind === 'advanced' &&
          [
            'auth_attempted',
            'finalize_attempted',
            'activation_attempted',
          ].includes(next)
            ? {}
            : null;
        if (capability)
          caps.set(capability, {
            operation: current,
            handed: false,
            used: false,
          });
        return { ...result, capability };
      },
      handoff(input) {
        const cap = caps.get(input.capability);
        if (!cap || cap.handed) return false;
        cap.handed = true;
        return true;
      },
      createPending: (input) => phase(input, 'auth', input.temporaryPassword),
      finalize: (input) => phase(input, 'finalize'),
      activateAndConfirm: (input) => phase(input, 'activate'),
    };
  };
  return {
    store,
    operation: () =>
      EmployeeOperationSnapshotSchema.parse(structuredClone(row)),
    holdAuthorization(phase: EmployeeOperationSnapshot['phase']) {
      const hold = { phase, entered: signal(), release: signal() };
      authorizationHold = hold;
      return hold;
    },
    faultAck(
      phase: EmployeeOperationSnapshot['phase'],
      mutate: (value: EmployeeOperationSnapshot) => EmployeeOperationSnapshot
    ) {
      ackFault = { phase, mutate };
    },
    replaceLease() {
      if (row) row.leaseId = receiptId;
    },
    holdProvider() {
      providerHeld = true;
      return {
        entered: providerEntered.promise,
        release: providerRelease.resolve,
      };
    },
    provider,
    history,
    intents,
    journal: () => createEmployeeCreationJournal({ store, provider }),
    snapshot: () => structuredClone(row),
    counts: () => ({ creates, finalizes, activates }),
    fail(value: typeof fail) {
      fail = value;
    },
    revokeAfterAuth: () => (revokeAfterAuth = true),
    expire() {
      time = 62000;
    },
    loseAuthMark: () => (lostAuthMark = true),
    denyCas: () => (casDenied = true),
  };
}
const run = (
  journal: ReturnType<typeof createEmployeeCreationJournal>,
  input = payload
) => journal.claimAndRun({ actorUserId: actor, operationId, payload: input });
const expectedPending = {
  targetUserId: target,
  outcome: {
    status: 'pending',
    operationId,
    code: 'account_creation_outcome_unknown',
    nextAction: 'inspect',
  },
};
const expectedKnownPending = {
  ...expectedPending,
  outcome: {
    ...expectedPending.outcome,
    code: 'employee_provisioning_pending',
  },
};
describe('durable employee journal', () => {
  it('has no availability without both qualified ports', async () => {
    expect(await createEmployeeCreationJournal({}).available(actor)).toBe(
      false
    );
    const f = fixture();
    expect(
      await createEmployeeCreationJournal({ store: f.store }).available(actor)
    ).toBe(false);
    await expect(run(createEmployeeCreationJournal({}))).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
  it('keeps unavailable provider from claiming or dispatching', async () => {
    const f = fixture();
    f.provider.available = async () => false;
    expect(await f.journal().available(actor)).toBe(false);
    await expect(run(f.journal())).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(f.snapshot()).toBeNull();
    expect(f.counts()).toEqual({ creates: 0, finalizes: 0, activates: 0 });
  });
  it('creates once with durable identity, phase marks and complete confirmations', async () => {
    const f = fixture();
    const expected = {
      targetUserId: target,
      outcome: {
        status: 'created',
        operationId,
        account: {
          id: target,
          email: payload.email,
          displayName: payload.displayName,
        },
      },
    };
    expect(await run(f.journal())).toEqual(expected);
    expect(await run(f.journal())).toEqual(expected);
    expect(f.counts()).toEqual({ creates: 1, finalizes: 1, activates: 1 });
    expect([...f.history.values()].map((v) => v.nextPhase)).toEqual([
      'auth_attempted',
      'auth_confirmed',
      'finalize_attempted',
      'provisioned',
      'activation_attempted',
      'active',
    ]);
    expect(
      JSON.stringify({
        row: f.snapshot(),
        history: [...f.history.values()],
        intents: [...f.intents],
      })
    ).not.toContain(payload.temporaryPassword);
  });
  it('concurrent instances permit one execution while another inspects', async () => {
    const f = fixture();
    const gate = f.holdProvider();
    const first = observe(run(f.journal()));
    try {
      await admitted(gate.entered, first);
      expect(await run(f.journal())).toEqual(expectedPending);
    } finally {
      gate.release();
      await bounded(first);
    }
    expect(await first).toMatchObject({
      kind: 'success',
      value: { outcome: { status: 'created' } },
    });
    expect(f.counts().creates).toBe(1);
  });
  it('preadmission failure is captured and owned gates drain finitely', async () => {
    const f = fixture();
    const gate = f.holdProvider();
    f.provider.available = async () => false;
    const first = observe(run(f.journal()));
    try {
      await expect(admitted(gate.entered, first)).rejects.toMatchObject({
        code: 'unavailable',
      });
    } finally {
      gate.release();
      await bounded(first);
    }
    expect(await first).toMatchObject({
      kind: 'failure',
      error: { code: 'unavailable' },
    });
    expect(f.counts()).toEqual({ creates: 0, finalizes: 0, activates: 0 });
  });
  it.each([
    'auth_attempted',
    'finalize_attempted',
    'activation_attempted',
  ] as const)(
    'causal durable revoke during authorization blocks %s',
    async (phase) => {
      const f = fixture();
      const hold = f.holdAuthorization(phase);
      const first = observe(run(f.journal()));
      try {
        await admitted(hold.entered.promise, first);
        await f.store.revoke(f.operation());
      } finally {
        hold.release.resolve();
        await bounded(first);
      }
      expect(await first).toEqual({
        kind: 'success',
        value:
          phase === 'auth_attempted' ? expectedPending : expectedKnownPending,
      });
      expect(f.counts()).toEqual({
        creates: phase === 'auth_attempted' ? 0 : 1,
        finalizes: phase === 'activation_attempted' ? 1 : 0,
        activates: 0,
      });
      expect(f.snapshot()).toMatchObject({
        targetUserId: target,
        revoked: true,
        phase,
      });
      expect(f.intents.get(target)).toEqual(identity);
      expect(await run(f.journal())).toEqual(expectedPending);
    }
  );
  it('causal replaced lease during authorization cannot dispatch stale claimant', async () => {
    const f = fixture();
    const hold = f.holdAuthorization('auth_attempted');
    const first = observe(run(f.journal()));
    try {
      await admitted(hold.entered.promise, first);
      f.replaceLease();
    } finally {
      hold.release.resolve();
      await bounded(first);
    }
    expect(await first).toEqual({ kind: 'success', value: expectedPending });
    expect(f.counts()).toEqual({ creates: 0, finalizes: 0, activates: 0 });
    expect(await run(f.journal())).toEqual(expectedPending);
  });
  it.each([
    'lease',
    'submitted-null',
    'submitted-reference',
    'preserved-null',
  ] as const)(
    'causal malformed %s ACK blocks the next provider phase',
    async (fault) => {
      const f = fixture();
      const phase =
        fault === 'lease'
          ? 'auth_attempted'
          : fault === 'preserved-null'
            ? 'finalize_attempted'
            : 'auth_confirmed';
      f.faultAck(phase, (value) => ({
        ...value,
        ...(fault === 'lease'
          ? { leaseId: receiptId }
          : {
              lastReceipt:
                fault === 'submitted-reference' && value.lastReceipt
                  ? { ...value.lastReceipt, providerReceiptId: lease }
                  : null,
            }),
      }));
      expect(await run(f.journal())).toMatchObject({
        targetUserId: target,
        outcome: { status: 'pending' },
      });
      expect(f.counts()).toEqual({
        creates: fault === 'lease' ? 0 : 1,
        finalizes: 0,
        activates: 0,
      });
      expect(f.snapshot()?.targetUserId).toBe(target);
      expect(await run(f.journal())).toEqual(expectedPending);
    }
  );
  it('post-admission revoke cannot cancel the owned provider await', async () => {
    const f = fixture();
    const gate = f.holdProvider();
    const first = observe(run(f.journal()));
    try {
      await admitted(gate.entered, first);
      await f.store.revoke(f.operation());
    } finally {
      gate.release();
      await bounded(first);
    }
    expect(await first).toEqual({
      kind: 'success',
      value: expectedKnownPending,
    });
    expect(f.counts()).toEqual({ creates: 1, finalizes: 0, activates: 0 });
    expect(f.snapshot()).toMatchObject({ targetUserId: target, revoked: true });
  });
  it.each(['auth', 'finalize', 'activate', 'receipt'] as const)(
    'lost or malformed %s outcome never replays creation',
    async (failure) => {
      const f = fixture();
      f.fail(failure);
      expect(await run(f.journal())).toEqual(
        failure === 'finalize' || failure === 'activate'
          ? expectedKnownPending
          : expectedPending
      );
      expect(await run(f.journal())).toEqual(expectedPending);
      expect(f.counts().creates).toBe(1);
      expect(f.snapshot()?.targetUserId).toBe(target);
      expect(f.snapshot()?.phase).toBe(
        failure === 'finalize'
          ? 'finalize_attempted'
          : failure === 'activate'
            ? 'activation_attempted'
            : 'unknown'
      );
    }
  );
  it('lost attempted-mark acknowledgement dispatches no Auth effect', async () => {
    const f = fixture();
    f.loseAuthMark();
    expect(await run(f.journal())).toEqual(expectedPending);
    expect(await run(f.journal())).toEqual(expectedPending);
    expect(f.snapshot()?.phase).toBe('auth_attempted');
    expect(f.counts().creates).toBe(0);
  });
  it('same operation with changed payload conflicts without dispatch', async () => {
    const f = fixture();
    await run(f.journal());
    expect(
      await run(f.journal(), { ...payload, displayName: 'Different' })
    ).toEqual({
      targetUserId: target,
      outcome: {
        status: 'conflict',
        operationId,
        code: 'employee_operation_payload_conflict',
        nextAction: 'inspect',
      },
    });
    expect(f.counts().creates).toBe(1);
  });
  it('password is excluded from identity and replay never reuses it', async () => {
    const f = fixture();
    await run(f.journal());
    expect(
      await run(f.journal(), {
        ...payload,
        temporaryPassword: 'another-transient-password',
      })
    ).toMatchObject({ outcome: { status: 'created' } });
    expect(f.counts().creates).toBe(1);
  });
  it('authority revocation after Auth leaves selected identity for inspection', async () => {
    const f = fixture();
    f.revokeAfterAuth();
    expect(await run(f.journal())).toEqual(expectedKnownPending);
    expect(f.snapshot()?.phase).toBe('auth_attempted');
    expect(f.counts()).toEqual({ creates: 1, finalizes: 0, activates: 0 });
  });
  it('expiry after attempted effect fences future phase writes and creation', async () => {
    const f = fixture();
    const original = f.provider.createPending;
    f.provider.createPending = async (value) => {
      const receipt = await original(value);
      f.expire();
      return receipt;
    };
    expect(await run(f.journal())).toMatchObject({
      targetUserId: target,
      outcome: { status: 'pending' },
    });
    expect(await run(f.journal())).toMatchObject({
      targetUserId: target,
      outcome: { status: 'pending' },
    });
    expect(f.counts()).toEqual({ creates: 1, finalizes: 0, activates: 0 });
  });
  it('failed CAS cannot dispatch an effect', async () => {
    const f = fixture();
    f.denyCas();
    expect(await run(f.journal())).toEqual(expectedPending);
    expect(f.counts()).toEqual({ creates: 0, finalizes: 0, activates: 0 });
  });
  it('retains confirmed SQL/profile/mailbox receipt when activation becomes unknown', async () => {
    const f = fixture();
    f.fail('activate');
    await run(f.journal());
    expect(f.snapshot()?.lastReceipt).toMatchObject({
      sqlConfirmed: true,
      profilesConfirmed: true,
      mailboxConfirmed: true,
      grantsConfirmed: true,
      providerActive: false,
    });
    expect(f.snapshot()?.phase).toBe('activation_attempted');
  });
});
