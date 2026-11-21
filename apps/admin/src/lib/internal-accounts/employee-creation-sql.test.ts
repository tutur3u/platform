import { describe, expect, it, vi } from 'vitest';
import { EMPLOYEE_CREATION_SIGNATURES } from './employee-creation-database-readiness';
import {
  createEmployeeAccount,
  EMPLOYEE_SQL_COMMITTED_READINESS_UNAVAILABLE,
  type EmployeeCreationProvider,
} from './employee-creation-orchestration';
import {
  createEmployeeCreationSqlOperations,
  type EmployeeSqlQuery,
  type EmployeeSqlTransactions,
} from './employee-creation-sql';

vi.mock('server-only', () => ({}));
const ACTOR = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const named = {
  actorUserId: ACTOR,
  userId: USER,
  email: 'employee@tuturuuu.com',
  displayName: 'Employee',
};
const identity = { actorUserId: ACTOR, userId: USER, email: named.email };
function harness() {
  const requirements = {
    projectRef: 'a'.repeat(20),
    contractRevision: 1,
    qualifiedSourceSha: 'b'.repeat(40),
    migrations: ['20261011002107', '20261011002108'],
    functions: EMPLOYEE_CREATION_SIGNATURES.map((signature) => ({
      signature,
      definitionHash: 'c'.repeat(64),
    })),
  };
  const proof = {
    ...requirements,
    kind: 'qualified',
    connectionConfigured: true,
    qualificationPassed: true,
    executionRole: 'service_role',
    privateSchemaUsage: true,
    publicExecute: false,
    anonExecute: false,
    authenticatedExecute: false,
    functionExecutionAllowed: true,
    observedAt: 1000,
    expiresAt: 2000,
  };
  const readReadiness = vi
    .fn<() => Promise<unknown>>()
    .mockResolvedValue(proof);
  const calls: Array<{ text: string; parameters: string[] }> = [];
  const query = vi.fn<EmployeeSqlQuery>(async (strings, ...parameters) => {
    const text = strings.join('?');
    calls.push({ text, parameters });
    if (text.startsWith('select current_user'))
      return [
        {
          role: 'service_role',
          jwt_role: 'service_role',
          subject: null,
          claims: { role: 'service_role' },
        },
      ];
    if (text.includes('private.employee_creation_preflight'))
      return [{ result: true }];
    if (text.includes('private.finalize_employee_creation'))
      return [
        {
          result: {
            id: USER,
            email: named.email,
            displayName: named.displayName,
            status: 'pending',
          },
        },
      ];
    if (text.includes('private.confirm_employee_activation'))
      return [
        {
          result: {
            id: USER,
            email: named.email,
            displayName: named.displayName,
            status: 'created',
          },
        },
      ];
    return [];
  });
  let commits = 0;
  let rollbacks = 0;
  const transactions: EmployeeSqlTransactions = {
    qualification: {
      kind: 'qualified-exclusive-owned',
      deadlineMs: 15_000,
      poolAndBeginBounded: true,
      statementsAndLocksBounded: true,
      commitAcknowledgementBounded: true,
      exactOwnedAbortAndDrain: true,
    },
    run: async (work) => {
      try {
        const result = await work(query);
        commits += 1;
        return { kind: 'committed', reply: result };
      } catch (error) {
        rollbacks += 1;
        return { kind: 'aborted', error };
      }
    },
  };
  let now = 1500;
  const operations = createEmployeeCreationSqlOperations({
    actorUserId: ACTOR,
    transactions,
    requirements,
    readReadiness,
    clock: () => now,
  });
  return {
    operations,
    transactions,
    setNow: (value: number) => {
      now = value;
    },
    query,
    calls,
    proof,
    readReadiness,
    commits: () => commits,
    rollbacks: () => rollbacks,
  };
}
describe('typed protected employee creation SQL adapter', () => {
  it('uses literal parameterized private functions and verifies maintenance context each phase', async () => {
    const h = harness();
    expect(await h.operations.preflight(named)).toEqual({
      data: true,
      error: null,
    });
    expect(await h.operations.finalize(named)).toEqual({
      data: {
        id: USER,
        email: named.email,
        displayName: named.displayName,
        status: 'pending',
      },
      error: null,
    });
    expect(await h.operations.confirmActivation(identity)).toEqual({
      data: {
        id: USER,
        email: named.email,
        displayName: named.displayName,
        status: 'created',
      },
      error: null,
    });
    expect(h.readReadiness).toHaveBeenCalledTimes(15);
    expect(
      h.calls.filter((call) => call.text.startsWith('set local role'))
    ).toHaveLength(3);
    expect(
      h.calls.filter((call) =>
        call.text.includes(
          "set_config('request.jwt.claim.role', 'service_role', true)"
        )
      )
    ).toHaveLength(3);
    expect(
      h.calls
        .filter((call) => call.text.includes('private.'))
        .map((call) => call.parameters)
    ).toEqual([
      [ACTOR, USER, named.email, named.displayName],
      [ACTOR, USER, named.email, named.displayName],
      [ACTOR, USER, named.email],
    ]);
    expect(h.commits()).toBe(3);
  });
  it('denies absent transport rather than falling back to an unbounded driver', async () => {
    const h = harness();
    const operations = createEmployeeCreationSqlOperations({
      actorUserId: ACTOR,
      requirements: {},
      readReadiness: h.readReadiness,
    });
    expect(await operations.preflight(named)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(h.readReadiness).not.toHaveBeenCalled();
    expect(h.query).not.toHaveBeenCalled();
  });
  it('does not bind a transaction whose bounded transport reports unknown commit disposition', async () => {
    const h = harness();
    h.transactions.run = async () => ({ kind: 'commit_unknown' });
    expect(await h.operations.preflight(named)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(await h.operations.finalize(named)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(h.query).not.toHaveBeenCalled();
  });
  it('rejects malformed committed acknowledgements without binding success', async () => {
    const h = harness();
    h.transactions.run = async () => ({
      kind: 'committed',
      reply: { data: false, error: null },
    });
    expect(await h.operations.preflight(named)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(await h.operations.finalize(named)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(h.query).not.toHaveBeenCalled();
  });
  it('rejects missing readiness before any SQL/provider boundary', async () => {
    const h = harness();
    h.readReadiness.mockResolvedValue(null);
    expect(await h.operations.preflight(named)).toEqual({
      data: null,
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(h.query).not.toHaveBeenCalled();
  });
  it('blocks the existing creation orchestration before any provider call when proof is absent', async () => {
    const h = harness();
    h.readReadiness.mockResolvedValue(null);
    const createUser = vi.fn<EmployeeCreationProvider['createUser']>();
    const updateUserById = vi.fn<EmployeeCreationProvider['updateUserById']>();
    const getUserById = vi.fn<EmployeeCreationProvider['getUserById']>();
    await expect(
      createEmployeeAccount({
        actorUserId: ACTOR,
        email: named.email,
        displayName: named.displayName,
        temporaryPassword: 'synthetic-fixture-only',
        operations: h.operations,
        provider: { createUser, updateUserById, getUserById },
      })
    ).rejects.toMatchObject({
      status: 503,
      code: 'employee_creation_unavailable',
    });
    expect(h.query).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });
  it('requires a fresh proof for later phases and exact original identity binding', async () => {
    const h = harness();
    expect(await h.operations.confirmActivation(identity)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(h.query).not.toHaveBeenCalled();
    await h.operations.preflight(named);
    h.readReadiness.mockResolvedValue({
      ...h.proof,
      qualificationPassed: false,
    });
    const count = h.calls.length;
    expect(await h.operations.finalize(named)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(h.calls).toHaveLength(count);
    expect(
      await h.operations.confirmActivation({ ...identity, userId: OTHER })
    ).toMatchObject({ error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' } });
  });
  it('sets literal finite statement, lock and idle-in-transaction bounds', async () => {
    const h = harness();
    await h.operations.preflight(named);
    expect(h.calls.slice(0, 3)).toEqual([
      { text: "set local statement_timeout = '5s'", parameters: [] },
      { text: "set local lock_timeout = '2s'", parameters: [] },
      {
        text: "set local idle_in_transaction_session_timeout = '5s'",
        parameters: [],
      },
    ]);
  });
  it('rechecks expiry after transaction admission before SQL effects', async () => {
    const h = harness();
    const run = h.transactions.run;
    h.transactions.run = async (work) => {
      h.setNow(2000);
      return run(work);
    };
    expect(await h.operations.preflight(named)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(h.query).not.toHaveBeenCalled();
    expect(h.rollbacks()).toBe(1);
  });
  it('rolls back if the function acknowledgement arrives after proof expiry', async () => {
    const h = harness();
    const query = h.query.getMockImplementation();
    h.query.mockImplementation(async (strings, ...parameters) => {
      const result = await query?.(strings, ...parameters);
      if (strings.join('').includes('private.')) h.setNow(2000);
      return result;
    });
    expect(await h.operations.preflight(named)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(h.commits()).toBe(0);
    expect(h.rollbacks()).toBe(1);
  });
  it('preserves known commit but does not bind success after an expired commit acknowledgement', async () => {
    const h = harness();
    const run = h.transactions.run;
    h.transactions.run = async (work) => {
      const reply = await run(work);
      h.setNow(2000);
      return reply;
    };
    expect(await h.operations.preflight(named)).toMatchObject({
      error: { code: EMPLOYEE_SQL_COMMITTED_READINESS_UNAVAILABLE },
    });
    h.setNow(1500);
    expect(await h.operations.finalize(named)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(h.commits()).toBe(1);
  });
  it('retains an exact committed finalize receipt when readiness expires after acknowledgement', async () => {
    const h = harness();
    await h.operations.preflight(named);
    const run = h.transactions.run;
    h.transactions.run = async (work) => {
      const reply = await run(work);
      h.setNow(2000);
      return reply;
    };
    expect(await h.operations.finalize(named)).toEqual({
      data: {
        id: USER,
        email: named.email,
        displayName: named.displayName,
        status: 'pending',
      },
      error: { code: EMPLOYEE_SQL_COMMITTED_READINESS_UNAVAILABLE },
    });
    expect(h.commits()).toBe(2);
    expect(await h.operations.confirmActivation(identity)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(h.commits()).toBe(2);
  });
  it('never forwards extra password fields or a foreign actor to SQL', async () => {
    const h = harness();
    const extraFields = { ...named, temporaryPassword: 'fixture-only' };
    expect(await h.operations.preflight(extraFields)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(
      await h.operations.preflight({ ...named, actorUserId: OTHER })
    ).toMatchObject({ error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' } });
    expect(h.query).not.toHaveBeenCalled();
  });
  it('rolls back malformed acknowledgements instead of accepting partial writes', async () => {
    for (const result of [
      null,
      false,
      [],
      [{ result: true }, { result: true }],
      [{ result: true, extra: 'unexpected' }],
    ]) {
      const h = harness();
      h.query.mockImplementation(async (strings) =>
        strings.join('').includes('current_user')
          ? [
              {
                role: 'service_role',
                jwt_role: 'service_role',
                subject: null,
                claims: { role: 'service_role' },
              },
            ]
          : strings.join('').includes('private.')
            ? result
            : []
      );
      expect(await h.operations.preflight(named)).toMatchObject({
        error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
      });
      expect(h.commits()).toBe(0);
      expect(h.rollbacks()).toBe(1);
    }
  });
  it('rejects receipt UUID/email/name/status mismatch and requests transaction rollback', async () => {
    for (const change of [
      { id: OTHER },
      { email: 'other@tuturuuu.com' },
      { displayName: 'Other' },
      { status: 'created' },
      { secret: 'unexpected' },
    ]) {
      const h = harness();
      await h.operations.preflight(named);
      const original = h.query.getMockImplementation();
      h.query.mockImplementation(async (strings, ...parameters) =>
        strings.join('').includes('private.finalize')
          ? [
              {
                result: {
                  id: USER,
                  email: named.email,
                  displayName: named.displayName,
                  status: 'pending',
                  ...change,
                },
              },
            ]
          : original?.(strings, ...parameters)
      );
      expect(await h.operations.finalize(named)).toMatchObject({
        error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
      });
      expect(h.rollbacks()).toBe(1);
    }
  });
  it('rejects unexpected SQL/JWT role or inherited subject before calling a function', async () => {
    const h = harness();
    h.query.mockImplementation(async (strings) =>
      strings.join('').includes('current_user')
        ? [
            {
              role: 'service_role',
              jwt_role: 'authenticated',
              subject: USER,
              claims: { role: 'authenticated', sub: USER },
            },
          ]
        : []
    );
    expect(await h.operations.preflight(named)).toMatchObject({
      error: { code: 'EMPLOYEE_SCHEMA_UNAVAILABLE' },
    });
    expect(
      h.query.mock.calls.some(([strings]) =>
        strings.join('').includes('private.')
      )
    ).toBe(false);
  });
  it.each(['23505', '42501', '42883'])(
    'returns only sanitized error code for %s',
    async (code) => {
      const h = harness();
      h.query.mockRejectedValue({
        code,
        message: 'secret raw provider/database payload',
        detail: 'sensitive',
      });
      expect(await h.operations.preflight(named)).toEqual({
        data: null,
        error: {
          code: code === '42883' ? 'EMPLOYEE_SCHEMA_UNAVAILABLE' : code,
        },
      });
    }
  );
});
