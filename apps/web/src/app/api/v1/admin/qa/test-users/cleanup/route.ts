import { requireQaOperator } from '@/lib/qa-test-users/authorization';
import {
  admitCiCleanup,
  auditCi,
  ciRefusalBody,
} from '@/lib/qa-test-users/ci-policy';
import { deleteQaUsers } from '@/lib/qa-test-users/deletion';
import { qaErrorResponse, qaJson, readQaJson } from '@/lib/qa-test-users/http';
import { cleanupQaUsersSchema } from '@/lib/qa-test-users/policy';
import { createQaDeletionDeps } from '@/lib/qa-test-users/runtime';
import { createQaStore } from '@/lib/qa-test-users/store';

// Leaves margin inside the platform request timeout; the rest is retried.
const CLEANUP_BUDGET_MS = 45_000;

export async function POST(request: Request) {
  const access = await requireQaOperator(request);
  if (!access.ok) return access.response;
  const { principal, operator } = access;
  const parsed = cleanupQaUsersSchema.safeParse(await readQaJson(request));
  if (!parsed.success) {
    if (principal.kind === 'github-ci')
      auditCi('cleanup', principal.claims, { outcome: 'invalid' }, 'warn');
    return qaJson({ error: 'Pass a run ID or expired' }, 400);
  }
  const qaRunId = 'runId' in parsed.data ? parsed.data.runId : null;
  try {
    const store = createQaStore(access.admin);
    let userIds: string[];
    if (principal.kind === 'github-ci') {
      const admitted = await admitCiCleanup(store, operator.id, parsed.data);
      if (!('userIds' in admitted)) {
        auditCi(
          'cleanup',
          principal.claims,
          { outcome: 'refused', reason: admitted.reason, qaRunId },
          'warn'
        );
        return qaJson(ciRefusalBody(admitted), admitted.status);
      }
      userIds = admitted.userIds;
    } else if ('runId' in parsed.data) {
      userIds = (await store.listUsers(parsed.data.runId, false)).map(
        (user) => user.userId
      );
    } else {
      const due = await store.listExpired(25);
      if (due.mode === 'fenced')
        return qaJson({ fenced: true, deleted: [], pending: [], skipped: [] });
      userIds = due.userIds;
    }
    const result = await deleteQaUsers(
      createQaDeletionDeps(access.admin),
      userIds,
      'operator',
      operator.id,
      { deadline: Date.now() + CLEANUP_BUDGET_MS }
    );
    if (principal.kind === 'github-ci')
      auditCi('cleanup', principal.claims, {
        outcome: 'ok',
        qaRunId,
        deleted: result.deleted.length,
        pending: result.pending.length,
        skipped: result.skipped.length,
      });
    return qaJson(result);
  } catch (error) {
    if (principal.kind === 'github-ci')
      auditCi(
        'cleanup',
        principal.claims,
        { outcome: 'error', qaRunId },
        'warn'
      );
    return qaErrorResponse(error, 'cleanup');
  }
}
