import { z } from 'zod';
import {
  isBrowserRequest,
  refuseMobileSessionForBrowser,
} from '@/lib/auth/browser-request';
import { requireQaOperator } from '@/lib/qa-test-users/authorization';
import {
  admitCiTarget,
  auditCi,
  ciRefusalBody,
} from '@/lib/qa-test-users/ci-policy';
import { qaErrorResponse, qaJson, readQaJson } from '@/lib/qa-test-users/http';
import { mintQaSessionSchema } from '@/lib/qa-test-users/policy';
import { createQaSessionDeps } from '@/lib/qa-test-users/runtime';
import {
  mintQaSession,
  resolveSessionOrigin,
} from '@/lib/qa-test-users/session';

const ENDPOINT = '/api/v1/admin/qa/test-users/[userId]/session';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  // Minted QA sessions carry raw tokens for automation clients (SDK, CLI,
  // agent-browser, the E2E workflow), which send no Origin or Fetch Metadata.
  // A browser page never receives them.
  if (isBrowserRequest(request.headers)) {
    const refused = refuseMobileSessionForBrowser(ENDPOINT);
    return qaJson(refused.body, refused.status);
  }
  const access = await requireQaOperator(request);
  if (!access.ok) return access.response;
  const { principal, operator } = access;
  const userId = z.uuid().safeParse((await params).userId);
  const body = mintQaSessionSchema.safeParse(await readQaJson(request));
  if (!userId.success || !body.success) {
    if (principal.kind === 'github-ci')
      auditCi('session', principal.claims, { outcome: 'invalid' }, 'warn');
    return qaJson({ error: 'Invalid session request' }, 400);
  }
  try {
    if (principal.kind === 'github-ci') {
      const refusal = await admitCiTarget(
        access.admin,
        userId.data,
        operator.id
      );
      if (refusal) {
        auditCi(
          'session',
          principal.claims,
          { outcome: 'refused', reason: refusal.reason, userId: userId.data },
          'warn'
        );
        return qaJson(ciRefusalBody(refusal), refusal.status);
      }
    }
    const deps = createQaSessionDeps(access.admin);
    const origin = resolveSessionOrigin(
      new URL(request.url).origin,
      body.data.origin,
      deps.supabaseUrl
    );
    if (!origin) {
      if (principal.kind === 'github-ci')
        auditCi(
          'session',
          principal.claims,
          { outcome: 'invalid', reason: 'origin', userId: userId.data },
          'warn'
        );
      return qaJson({ error: 'Origin is not first-party' }, 400);
    }
    const minted = await mintQaSession(deps, userId.data, operator.id, origin);
    if (principal.kind === 'github-ci')
      auditCi('session', principal.claims, {
        outcome: 'ok',
        userId: userId.data,
        qaRunId: minted.runId,
        origin,
      });
    return qaJson(minted, 201);
  } catch (error) {
    if (principal.kind === 'github-ci')
      auditCi(
        'session',
        principal.claims,
        { outcome: 'error', userId: userId.data },
        'warn'
      );
    return qaErrorResponse(error, 'session');
  }
}
