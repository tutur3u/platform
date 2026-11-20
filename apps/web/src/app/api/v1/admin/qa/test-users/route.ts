import { connection } from 'next/server';
import { requireQaOperator } from '@/lib/qa-test-users/authorization';
import { qaErrorResponse, qaJson, readQaJson } from '@/lib/qa-test-users/http';
import { createQaUsersSchema, QA_RUN_ID } from '@/lib/qa-test-users/policy';
import { createQaUsers } from '@/lib/qa-test-users/provision';
import { createQaProvisionDeps } from '@/lib/qa-test-users/runtime';
import { createQaStore } from '@/lib/qa-test-users/store';

export async function GET(request: Request) {
  await connection();
  const access = await requireQaOperator(request);
  if (!access.ok) return access.response;
  const params = new URL(request.url).searchParams;
  const runId = params.get('run');
  if (runId !== null && !QA_RUN_ID.test(runId))
    return qaJson({ error: 'Invalid run ID' }, 400);
  try {
    const users = await createQaStore(access.admin).listUsers(
      runId,
      params.get('includeDeleted') === '1'
    );
    return qaJson({ users });
  } catch (error) {
    return qaErrorResponse(error, 'list');
  }
}

export async function POST(request: Request) {
  const access = await requireQaOperator(request);
  if (!access.ok) return access.response;
  const parsed = createQaUsersSchema.safeParse(await readQaJson(request));
  if (!parsed.success)
    return qaJson({ error: 'Invalid QA test user request' }, 400);
  try {
    const result = await createQaUsers(
      createQaProvisionDeps(access.admin),
      access.operator.id,
      parsed.data
    );
    return qaJson(result, result.users.length > 0 ? 201 : 503);
  } catch (error) {
    return qaErrorResponse(error, 'create');
  }
}
