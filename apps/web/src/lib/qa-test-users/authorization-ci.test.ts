import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
} from 'jose';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permissions: vi.fn(),
  getUserById: vi.fn(),
  keys: { current: undefined as unknown },
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.session,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
  })),
}));
vi.mock('./github-oidc', async (original) => {
  const real = await original<typeof import('./github-oidc')>();
  return {
    ...real,
    verifyQaCiToken: (token: string) =>
      real.verifyQaCiToken(token, { keys: mocks.keys.current as never }),
  };
});

import { QA_OPERATOR_PERMISSION, requireQaOperator } from './authorization';
import {
  QA_CI_JOB_WORKFLOW_REF,
  QA_CI_OIDC_AUDIENCE,
  QA_CI_OIDC_ISSUER,
} from './github-oidc';

const ciOperatorId = '33333333-3333-4333-8333-333333333333';
const ciOperator = {
  id: ciOperatorId,
  email: 'qa-ci@tuturuuu.com',
  email_confirmed_at: '2026-11-01T00:00:00Z',
  identities: [{ provider: 'google', identity_data: {} }],
  app_metadata: {},
};
let signing: CryptoKey;
let jwt: string;

async function sign(claims: JWTPayload = {}) {
  return new SignJWT({
    repository: 'tutur3u/platform',
    repository_id: '536896722',
    repository_owner_id: '107694301',
    ref: 'refs/heads/main',
    job_workflow_ref: QA_CI_JOB_WORKFLOW_REF,
    environment: 'upskii-production-e2e',
    event_name: 'schedule',
    run_id: '987654321',
    run_attempt: '2',
    sha: 'b'.repeat(40),
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(QA_CI_OIDC_ISSUER)
    .setAudience(QA_CI_OIDC_AUDIENCE)
    .setIssuedAt()
    .setNotBefore('0s')
    .setExpirationTime('5m')
    .sign(signing);
}

const ciRequest = (token = jwt, kind = 'github-oidc') =>
  new Request('https://tuturuuu.com/api/v1/admin/qa/test-users', {
    headers: {
      authorization: `Bearer ${token}`,
      'x-tuturuuu-qa-operator': kind,
    },
  });
const allow = (granted: string[]) =>
  mocks.permissions.mockResolvedValue({
    containsPermission: (permission: string) => granted.includes(permission),
  });

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  signing = pair.privateKey;
  mocks.keys.current = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }],
  });
  jwt = await sign();
});

let logs: unknown[][];
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('QA_CI_OPERATOR_USER_ID', ciOperatorId);
  mocks.getUserById.mockResolvedValue({
    data: { user: ciOperator },
    error: null,
  });
  allow([QA_OPERATOR_PERMISSION]);
  logs = [];
  for (const level of ['info', 'warn', 'error', 'log'] as const)
    vi.spyOn(console, level).mockImplementation((...args) => {
      logs.push(args);
    });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  // The token must never reach a log line, refused or admitted.
  expect(JSON.stringify(logs)).not.toContain(jwt.split('.')[2]);
});

describe('requireQaOperator with GitHub OIDC', () => {
  it('acts as the configured staff operator without a session', async () => {
    const access = await requireQaOperator(ciRequest());
    expect(access.ok).toBe(true);
    if (!access.ok) return;
    expect(access.operator.id).toBe(ciOperatorId);
    expect(access.principal).toEqual({
      kind: 'github-ci',
      claims: expect.objectContaining({
        runId: '987654321',
        runAttempt: '2',
        eventName: 'schedule',
      }),
    });
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.getUserById).toHaveBeenCalledWith(ciOperatorId);
    expect(mocks.permissions).toHaveBeenCalledWith({
      wsId: '00000000-0000-0000-0000-000000000000',
      user: { id: ciOperatorId, email: 'qa-ci@tuturuuu.com' },
    });
  });

  it.each(['', 'not-a-uuid'])(
    'refuses with 503 when QA_CI_OPERATOR_USER_ID is %j',
    async (value) => {
      vi.stubEnv('QA_CI_OPERATOR_USER_ID', value);
      const access = await requireQaOperator(ciRequest());
      expect(access.ok).toBe(false);
      if (!access.ok) expect(access.response.status).toBe(503);
      expect(mocks.getUserById).not.toHaveBeenCalled();
    }
  );

  it('refuses with 503 when QA_CI_OPERATOR_USER_ID is unset', async () => {
    vi.stubEnv('QA_CI_OPERATOR_USER_ID', undefined);
    const access = await requireQaOperator(ciRequest());
    if (!access.ok) expect(access.response.status).toBe(503);
    expect(access.ok).toBe(false);
  });

  it('refuses an unknown operator kind', async () => {
    const access = await requireQaOperator(ciRequest(jwt, 'staff'));
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(401);
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it('refuses a missing bearer', async () => {
    const access = await requireQaOperator(
      new Request('https://tuturuuu.com/x', {
        headers: { 'x-tuturuuu-qa-operator': 'github-oidc' },
      })
    );
    if (!access.ok) expect(access.response.status).toBe(401);
    expect(access.ok).toBe(false);
  });

  it('refuses a token from another workflow, logging claims but not the token', async () => {
    const other = await sign({
      job_workflow_ref:
        'tutur3u/platform/.github/workflows/other.yaml@refs/heads/main',
    });
    const access = await requireQaOperator(ciRequest(other));
    if (!access.ok) expect(access.response.status).toBe(403);
    expect(access.ok).toBe(false);
    expect(logs).toContainEqual([
      '[qa-ci-operator] refused',
      { reason: 'claim_job_workflow_ref' },
    ]);
    expect(JSON.stringify(logs)).not.toContain(other.split('.')[2]);
    expect(JSON.stringify(logs)).not.toContain(other.split('.')[1]);
  });

  it.each([
    ['without the QA permission', () => allow(['manage_workspace_members'])],
    [
      'when the operator account is not staff',
      () =>
        mocks.getUserById.mockResolvedValue({
          data: { user: { ...ciOperator, email: 'ci@example.com' } },
          error: null,
        }),
    ],
    [
      'when the operator account is a QA account',
      () =>
        mocks.getUserById.mockResolvedValue({
          data: { user: { ...ciOperator, app_metadata: { qa_test: true } } },
          error: null,
        }),
    ],
    [
      'when the operator account is banned',
      () =>
        mocks.getUserById.mockResolvedValue({
          data: {
            user: { ...ciOperator, banned_until: '2999-01-01T00:00:00Z' },
          },
          error: null,
        }),
    ],
  ])('refuses %s', async (_label, arrange) => {
    arrange();
    const access = await requireQaOperator(ciRequest());
    expect(access.ok).toBe(false);
    if (!access.ok) expect(access.response.status).toBe(403);
    expect(logs).toContainEqual([
      '[qa-ci-operator] refused',
      expect.objectContaining({
        reason: 'operator_account',
        runId: '987654321',
      }),
    ]);
  });

  it('keeps the staff session path when the operator header is absent', async () => {
    mocks.session.mockResolvedValue({
      ok: true,
      user: { id: ciOperatorId, email: 'qa-ci@tuturuuu.com' },
    });
    const access = await requireQaOperator(
      new Request('https://tuturuuu.com/x', {
        headers: { authorization: `Bearer ${jwt}` },
      })
    );
    expect(mocks.session).toHaveBeenCalled();
    expect(access.ok && access.principal).toEqual({ kind: 'staff' });
  });
});
