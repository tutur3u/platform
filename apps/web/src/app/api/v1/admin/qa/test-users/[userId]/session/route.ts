import { z } from 'zod';
import { requireQaOperator } from '@/lib/qa-test-users/authorization';
import { qaErrorResponse, qaJson, readQaJson } from '@/lib/qa-test-users/http';
import { mintQaSessionSchema } from '@/lib/qa-test-users/policy';
import { createQaSessionDeps } from '@/lib/qa-test-users/runtime';
import {
  mintQaSession,
  resolveSessionOrigin,
} from '@/lib/qa-test-users/session';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const access = await requireQaOperator(request);
  if (!access.ok) return access.response;
  const userId = z.uuid().safeParse((await params).userId);
  const body = mintQaSessionSchema.safeParse(await readQaJson(request));
  if (!userId.success || !body.success)
    return qaJson({ error: 'Invalid session request' }, 400);
  try {
    const deps = createQaSessionDeps(access.admin);
    const origin = resolveSessionOrigin(
      new URL(request.url).origin,
      body.data.origin,
      deps.supabaseUrl
    );
    if (!origin) return qaJson({ error: 'Origin is not first-party' }, 400);
    return qaJson(
      await mintQaSession(deps, userId.data, access.operator.id, origin),
      201
    );
  } catch (error) {
    return qaErrorResponse(error, 'session');
  }
}
