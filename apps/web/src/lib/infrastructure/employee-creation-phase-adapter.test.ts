import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmployeeCreationJournal,
  getEmployeeCreationKnownFacts,
} from './employee-creation-journal';
import {
  createEmployeeCreationOperationStore,
  type EmployeeOperationSnapshot,
} from './employee-creation-operation-store';
import {
  createEmployeeCreationPhaseAdapter,
  type EmployeePhaseCertificate,
} from './employee-creation-phase-adapter';
import {
  type EmployeeAuthAdmin,
  EmployeeScopeSchema,
  makeEmployeeCreationSupplier,
} from './employee-creation-supplier';

vi.mock('server-only', () => ({}));
const actor = '11111111-1111-4111-8111-111111111111',
  operationId = '22222222-2222-4222-8222-222222222222';
const target = '33333333-3333-4333-8333-333333333333',
  lease = '44444444-4444-4444-8444-444444444444';
const email = 'new@tuturuuu.com',
  password = 'transient-test-password';
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const migration = readFileSync(
  new URL(
    '../../../../database/supabase/migrations/20261011002108_employee_creation_finalization.sql',
    import.meta.url
  ),
  'utf8'
);
function definition(name: string) {
  const start = migration.indexOf(`create function private.${name}(`);
  return migration.slice(start, migration.indexOf('$$;', start) + 3);
}
type User = NonNullable<
  Awaited<ReturnType<EmployeeAuthAdmin['createUser']>>['data']['user']
>;
function fixture() {
  let time = 1000,
    configChanged = false;
  const members = new Set([actor]);
  const actorRows = new Map([
    [actor, { email: 'admin@tuturuuu.com', confirmed: true, banned: false }],
  ]);
  let applied = false;
  let row: EmployeeOperationSnapshot | null = null;
  const history = new Map<string, string>();
  const effects: string[] = [],
    sql: string[] = [];
  let fault = '',
    awaits = 0,
    failAt = 0,
    action = 'actor';
  const consumes: boolean[] = [];
  const configuration = {
    database: {
      host: 'invalid',
      port: 5432,
      database: 'postgres',
      user: 'fixture',
      password: 'db-fixture',
    },
    requirements: {},
    signedProjectBinding: {},
    executionQualification: {},
    trustedOperatorPublicKey: 'fixture',
  };
  const configHash = digest(JSON.stringify(configuration));
  const definitions = {
    finalize: definition('finalize_employee_creation'),
    confirm: definition('confirm_employee_activation'),
  };
  const certificate: EmployeePhaseCertificate = {
    sourceSha: '84ec8e04c4a412c7dd1501f2bb7ce14c0dda01ea',
    projectRef: 'a'.repeat(20),
    configurationSha256: configHash,
    observedAt: 0,
    expiresAt: 60_000,
    finalize: {
      signature: 'private.finalize_employee_creation(uuid,uuid,text,text)',
      definition: definitions.finalize,
      owner: 'postgres',
      searchPath: '',
      executeRoles: ['service_role'],
    },
    confirm: {
      signature: 'private.confirm_employee_activation(uuid,uuid,text)',
      definition: definitions.confirm,
      owner: 'postgres',
      searchPath: '',
      executeRoles: ['service_role'],
    },
  };
  async function edge() {
    awaits++;
    if (failAt === awaits) {
      applied = !['lease', 'version', 'phase'].includes(action) || row !== null;
      if (action === 'actor') members.delete(actor);
      else if (action === 'configuration') configChanged = true;
      else if (action === 'expiry') time = 61000;
      else if (action === 'scope') fault = 'header';
      else if (action === 'origin') fault = 'origin';
      else if (action === 'site') fault = 'site';
      else if (row && action === 'lease') row.leaseId = target;
      else if (row && action === 'version') row.version++;
      else if (row && action === 'phase') row.phase = 'unknown';
    }
  }
  const store = createEmployeeCreationOperationStore({
    now: () => time,
    async authorize(id) {
      const auth = actorRows.get(id);
      return members.has(id) && auth?.confirmed && !auth.banned
        ? {
            actorUserId: id,
            workspaceId: '00000000-0000-0000-0000-000000000000',
            membership: 'MEMBER',
            permission: 'admin',
            email: 'admin@tuturuuu.com',
            emailConfirmed: true,
            unbanned: true,
            observedAt: time,
            expiresAt: time + 60000,
          }
        : null;
    },
    rpc: {
      async ready() {
        return { ready: true };
      },
      async claim(value) {
        if (row) return { kind: 'inspect', operation: structuredClone(row) };
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
        return { kind: 'claimed', operation: structuredClone(row) };
      },
      async advance(input) {
        if (!row) throw new Error('missing');
        if (
          row.revoked ||
          input.leaseId !== row.leaseId ||
          input.expectedVersion !== row.version ||
          history.has(input.eventId)
        )
          return { kind: 'inspect', operation: structuredClone(row) };
        const graph = {
          reserved: 'auth_attempted',
          auth_attempted: 'auth_confirmed',
          auth_confirmed: 'finalize_attempted',
          finalize_attempted: 'provisioned',
          provisioned: 'activation_attempted',
          activation_attempted: 'active',
          active: '',
          unknown: '',
        };
        if (
          graph[row.phase] !== input.nextPhase &&
          input.nextPhase !== 'unknown'
        )
          throw new Error('invalid transition');
        history.set(input.eventId, input.nextPhase);
        row = {
          ...row,
          phase: input.nextPhase,
          version: row.version + 1,
          lastReceipt: input.receipt ?? row.lastReceipt,
        };
        if (fault === 'lost-provisioned' && input.nextPhase === 'provisioned')
          throw new Error('ACK lost');
        return { kind: 'advanced', operation: structuredClone(row) };
      },
      async revoke() {
        if (!row) throw new Error('missing');
        row.revoked = true;
        return structuredClone(row);
      },
    },
  });
  let user: User = {
    id: target,
    email,
    email_confirmed_at: '1970-01-01T00:00:00Z',
    banned_until: '2126-01-01T00:00:00Z',
    app_metadata: { employee_onboarding: true },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '1970-01-01T00:00:00Z',
  };
  const reply = (value: User) => ({ data: { user: value }, error: null });
  const auth: EmployeeAuthAdmin = {
    async createUser() {
      effects.push('create');
      await edge();
      return {
        data: { user: fault === 'uuid' ? { ...user, id: lease } : user },
        error: null,
      };
    },
    async getUserById() {
      effects.push('read');
      await edge();
      return reply(user);
    },
    async updateUserById() {
      effects.push('update');
      user = { ...user, banned_until: undefined };
      await edge();
      if (fault === 'active-halt') members.delete(actor);
      return reply(user);
    },
  };
  const adapter = createEmployeeCreationPhaseAdapter({
    makeSupplier: (input) =>
      makeEmployeeCreationSupplier({
        ...input,
        consumeCreatePermission: async (operation) => {
          const first = await input.consumeCreatePermission(operation);
          const second = await input.consumeCreatePermission(operation);
          consumes.push(first, second);
          return first;
        },
      }),
    scopeSchema: EmployeeScopeSchema,
    supplier: {
      auth,
      now: () => time,
      async readiness() {
        await edge();
        return {
          kind: 'qualified',
          configuration,
          observedAt: 0,
          expiresAt: 60000,
        };
      },
      async scope(operation) {
        await edge();
        return {
          operation,
          appSession: 'infrastructure',
          administrator: members.has(actor),
          actionAuthorized: true,
          actionHeader: fault === 'header' ? '0' : '1',
          origin: 'https://infra.invalid',
          requestOrigin:
            fault === 'origin'
              ? 'https://other.invalid'
              : 'https://infra.invalid',
          site: fault === 'site' ? 'cross-site' : 'same-origin',
        };
      },
      async executeFixedEmployeeSql(input) {
        sql.push(input.phase);
        await edge();
        if (fault === 'preflight-lost' && input.phase === 'preflight')
          return { kind: 'commit_unknown' };
        if (fault === 'preflight-stale' && input.phase === 'preflight')
          members.delete(actor);
        if (fault === 'finalize-halt' && input.phase === 'finalize')
          members.delete(actor);
        return {
          kind: 'committed',
          result:
            input.phase === 'preflight'
              ? fault !== 'preflight-false'
              : {
                  id: target,
                  email,
                  displayName: 'New',
                  status: input.phase === 'confirm' ? 'created' : 'pending',
                },
        };
      },
    },
    async certificate() {
      await edge();
      return fault === 'qualification'
        ? {
            ...certificate,
            confirm: { ...certificate.confirm, definition: 'not qualified' },
          }
        : certificate;
    },
    async verifyCertificate(value, config, port) {
      await edge();
      return (
        port === auth &&
        digest(JSON.stringify(config)) === configHash &&
        value.finalize.definition === definitions.finalize &&
        value.confirm.definition === definitions.confirm
      );
    },
    currentConfigurationSha256: () =>
      configChanged ? digest('changed') : configHash,
    expected: {
      sourceSha: certificate.sourceSha,
      projectRef: certificate.projectRef,
      finalize: { sha256: digest(definitions.finalize), owner: 'postgres' },
      confirm: { sha256: digest(definitions.confirm), owner: 'postgres' },
    },
  });
  return {
    store,
    adapter,
    effects,
    sql,
    history,
    state: () => row,
    setFault(value: string) {
      fault = value;
    },
    revoke() {
      members.delete(actor);
    },
    expire() {
      time = 61000;
    },
    changeConfig() {
      configChanged = true;
    },
    failAt(value: number, change = 'actor') {
      failAt = value;
      action = change;
    },
    awaits: () => awaits,
    replace() {
      if (row) row.leaseId = lease.replace(/^4/, '5');
    },
    bump() {
      if (row) row.version++;
    },
    consumes,
    applied: () => applied,
  };
}
const request = {
  actorUserId: actor,
  operationId,
  payload: { email, displayName: 'New', temporaryPassword: password },
};
const run = (f: ReturnType<typeof fixture>) =>
  createEmployeeCreationJournal({
    store: f.store,
    provider: f.adapter,
  }).claimAndRun(request);
describe('actual journal/adapter/immutable supplier composition', () => {
  it('one winner binds observed Auth resource and matched SQL confirmations; replay never creates', async () => {
    const f = fixture();
    const [a, b] = await Promise.all([run(f), run(f)]);
    expect([a, b]).toContainEqual({
      targetUserId: target,
      outcome: {
        status: 'created',
        operationId,
        account: { id: target, email, displayName: 'New' },
      },
    });
    expect(f.effects.filter((x) => x === 'create')).toHaveLength(1);
    expect(f.sql).toEqual(['preflight', 'finalize', 'confirm']);
    expect(f.state()?.lastReceipt?.providerReceiptId).toBe(target);
    await run(f);
    expect(f.effects.filter((x) => x === 'create')).toHaveLength(1);
    expect(
      JSON.stringify({ a, b, row: f.state(), history: [...f.history] })
    ).not.toContain(password);
  });
  it.each([
    'preflight-false',
    'preflight-lost',
    'preflight-stale',
    'qualification',
    'header',
  ])('%s cannot create Auth', async (fault) => {
    const f = fixture();
    f.setFault(fault);
    try {
      await run(f);
    } catch {}
    expect(f.effects).toEqual([]);
  });
  it('actual reply UUID mismatch cannot qualify or finalize', async () => {
    const f = fixture();
    f.setFault('uuid');
    const result = await run(f);
    expect(result).toMatchObject({ outcome: { status: 'pending' } });
    expect(f.sql).toEqual(['preflight']);
    expect(f.effects).toEqual(['create']);
    expect(f.consumes).toEqual([true, false]);
  });
  it.each(['active-halt', 'finalize-halt'])(
    '%s preserves known facts and forbids further confirmation/write',
    async (fault) => {
      const f = fixture();
      f.setFault(fault);
      const result = await run(f);
      expect(result).toMatchObject({
        outcome: { status: 'pending', code: 'employee_provisioning_pending' },
      });
      const facts = getEmployeeCreationKnownFacts(result);
      expect(facts.length).toBeGreaterThan(0);
      if (fault === 'active-halt')
        expect(facts).toContainEqual(
          expect.objectContaining({
            kind: 'auth',
            resourceId: target,
            state: 'active',
          })
        );
      else
        expect(facts).toContainEqual(
          expect.objectContaining({
            kind: 'sql',
            phase: 'finalize',
            receipt: {
              id: target,
              email,
              displayName: 'New',
              status: 'pending',
            },
          })
        );
      expect(f.sql).not.toContain('confirm');
      expect([...f.history.values()]).not.toContain('unknown');
      expect(Object.keys(result ?? {})).not.toContain('knownFacts');
      expect(JSON.stringify(facts)).not.toContain(password);
    }
  );
  it('lost provisioned ACK retains raw SQL fact but grants no activation', async () => {
    const f = fixture();
    f.setFault('lost-provisioned');
    const result = await run(f);
    expect(getEmployeeCreationKnownFacts(result)).toContainEqual(
      expect.objectContaining({ kind: 'sql', phase: 'finalize' })
    );
    expect(f.effects).not.toContain('update');
    await run(f);
    expect(f.effects).not.toContain('update');
  });
  it('opaque handoff and creation stages consume independently and once; forged/restarted keys denied', async () => {
    const f = fixture();
    const claim = await f.store.claim({
      actorUserId: actor,
      operationId,
      email,
      displayName: 'New',
    });
    const session = f.adapter.beginInvocation({
      store: f.store,
      operation: claim.operation,
    });
    const mark = await session.advance(
      'auth_attempted',
      null,
      '55555555-5555-4555-8555-555555555555'
    );
    if (!mark.capability) throw new Error('no winning cap');
    const input = {
      operation: mark.operation,
      capability: mark.capability,
      temporaryPassword: password,
    };
    expect(session.handoff(input)).toBe(true);
    expect(session.handoff(input)).toBe(false);
    expect(await session.createPending(input)).toMatchObject({
      kind: 'qualified',
    });
    expect(await session.createPending(input)).toEqual({ kind: 'denied' });
    expect(await session.createPending({ ...input, capability: {} })).toEqual({
      kind: 'denied',
    });
    const restarted = f.adapter.beginInvocation({
      store: f.store,
      operation: mark.operation,
    });
    await expect(
      restarted.advance('auth_attempted', null, lease)
    ).rejects.toThrow();
    expect(await restarted.createPending(input)).toEqual({ kind: 'denied' });
    expect(f.effects).toEqual(['create']);
    expect(f.consumes).toEqual([true, false]);
    await expect(
      session.advance('activation_attempted', null, lease)
    ).rejects.toThrow();
  });
  it('missing qualification and ports default deny', async () => {
    expect(await createEmployeeCreationPhaseAdapter().available(actor)).toBe(
      false
    );
  });
  it.each([
    'actor',
    'lease',
    'version',
    'phase',
    'expiry',
    'configuration',
    'scope',
    'origin',
    'site',
  ])('each awaited observation stops on current %s change', async (change) => {
    const positive = fixture();
    await run(positive);
    const total = positive.awaits();
    for (let edge = 1; edge <= total; edge++) {
      const f = fixture();
      f.failAt(edge, change);
      try {
        await run(f);
      } catch {}
      if (f.applied()) expect(f.state()?.phase).not.toBe('active');
      else expect(f.state()?.phase).toBe('active');
      expect(
        f.effects.filter((x) => x === 'create').length
      ).toBeLessThanOrEqual(1);
    }
  });
});
