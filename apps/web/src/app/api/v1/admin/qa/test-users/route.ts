import { connection } from 'next/server';
import { requireQaOperator } from '@/lib/qa-test-users/authorization';
import {
  admitCiCreate,
  auditCi,
  ciRefusalBody,
  isCiOwnedRow,
} from '@/lib/qa-test-users/ci-policy';
import { qaErrorResponse, qaJson, readQaJson } from '@/lib/qa-test-users/http';
import { createQaUsersSchema, QA_RUN_ID } from '@/lib/qa-test-users/policy';
import { createQaUsers } from '@/lib/qa-test-users/provision';
import { createQaProvisionDeps } from '@/lib/qa-test-users/runtime';
import { createQaStore } from '@/lib/qa-test-users/store';

export async function GET(request: Request) {
  await connection();
  const access = await requireQaOperator(request);
  if (!access.ok) return access.response;
  const { principal, operator } = access;
  const params = new URL(request.url).searchParams;
  const runId = params.get('run');
  if (runId !== null && !QA_RUN_ID.test(runId)) {
    if (principal.kind === 'github-ci')
      auditCi('list', principal.claims, { outcome: 'invalid' }, 'warn');
    return qaJson({ error: 'Invalid run ID' }, 400);
  }
  try {
    const users = await createQaStore(access.admin).listUsers(
      runId,
      params.get('includeDeleted') === '1'
    );
    if (principal.kind !== 'github-ci') return qaJson({ users });
    // Orphan sweeps see only this principal's own `upskii-e2e` runs.
    const own = users.filter((user) => isCiOwnedRow(user, operator.id));
    auditCi('list', principal.claims, {
      outcome: 'ok',
      qaRunId: runId,
      rows: own.length,
    });
    return qaJson({ users: own });
  } catch (error) {
    if (principal.kind === 'github-ci')
      auditCi('list', principal.claims, { outcome: 'error' }, 'warn');
    return qaErrorResponse(error, 'list');
  }
}

export async function POST(request: Request) {
  const access = await requireQaOperator(request);
  if (!access.ok) return access.response;
  const { principal, operator } = access;
  const parsed = createQaUsersSchema.safeParse(await readQaJson(request));
  if (!parsed.success) {
    if (principal.kind === 'github-ci')
      auditCi('create', principal.claims, { outcome: 'invalid' }, 'warn');
    return qaJson({ error: 'Invalid QA test user request' }, 400);
  }
  const input = parsed.data;
  const audit = {
    count: input.count,
    staff: input.staff,
    tier: input.tier,
    workspace: input.workspace,
    ttlSeconds: input.ttlSeconds ?? null,
    qaRunId: input.runId ?? null,
  };
  try {
    if (principal.kind === 'github-ci') {
      const refusal = await admitCiCreate(
        createQaStore(access.admin),
        operator.id,
        input
      );
      if (refusal) {
        auditCi(
          'create',
          principal.claims,
          { ...audit, outcome: 'refused', reason: refusal.reason },
          'warn'
        );
        return qaJson(ciRefusalBody(refusal), refusal.status);
      }
    }
    const result = await createQaUsers(
      createQaProvisionDeps(access.admin),
      operator.id,
      input
    );
    if (principal.kind === 'github-ci')
      auditCi('create', principal.claims, {
        ...audit,
        outcome: result.users.length > 0 ? 'ok' : 'failed',
        qaRunId: result.runId,
        created: result.users.length,
        failed: result.failed.length,
      });
    return qaJson(result, result.users.length > 0 ? 201 : 503);
  } catch (error) {
    if (principal.kind === 'github-ci')
      auditCi(
        'create',
        principal.claims,
        { ...audit, outcome: 'error' },
        'warn'
      );
    return qaErrorResponse(error, 'create');
  }
}
