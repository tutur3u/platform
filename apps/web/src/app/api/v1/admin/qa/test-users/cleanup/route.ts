import { requireQaOperator } from '@/lib/qa-test-users/authorization';
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
  const parsed = cleanupQaUsersSchema.safeParse(await readQaJson(request));
  if (!parsed.success)
    return qaJson({ error: 'Pass a run ID or expired' }, 400);
  try {
    const store = createQaStore(access.admin);
    let userIds: string[];
    if ('runId' in parsed.data) {
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
      access.operator.id,
      { deadline: Date.now() + CLEANUP_BUDGET_MS }
    );
    return qaJson(result);
  } catch (error) {
    return qaErrorResponse(error, 'cleanup');
  }
}
