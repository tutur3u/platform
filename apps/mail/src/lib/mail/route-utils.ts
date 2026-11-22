import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { resolveMailRouteContext } from './auth';
import {
  MAIL_READ_REQUEST_TIMEOUT_MS,
  MAIL_READ_RETRY_AFTER_SECONDS,
  MailReadBudget,
  MailReadTimeout,
} from './read-budget';
import { MAIL_READ_TIMEOUT_CODE } from './read-timeout-contract';
import { MAIL_SEND_PUBLIC_MESSAGE, MailSendError } from './send-error';
import type { MailRouteContext } from './types';

export async function parseJsonBody<T extends z.ZodType>(
  request: NextRequest,
  schema: T
): Promise<
  { ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }
> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400 }
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

export async function withMailContext(
  request: NextRequest,
  wsId: string,
  handler: (ctx: MailRouteContext) => Promise<NextResponse>,
  options?: { boundedRead: true }
) {
  const budget = options?.boundedRead ? new MailReadBudget() : undefined;
  const run = async () => {
    const resolved = await (budget
      ? resolveMailRouteContext(request, wsId, false, budget)
      : resolveMailRouteContext(request, wsId));
    if (!resolved.ok) return resolved.response;
    return handler(resolved.context);
  };
  try {
    return await (budget
      ? budget.run('request', run, MAIL_READ_REQUEST_TIMEOUT_MS)
      : run());
  } catch (error) {
    if (error instanceof MailReadTimeout) {
      console.warn('[mail] read timed out', { stage: error.stage });
      return NextResponse.json(
        { code: MAIL_READ_TIMEOUT_CODE, error: error.message },
        {
          status: 503,
          headers: { 'Retry-After': String(MAIL_READ_RETRY_AFTER_SECONDS) },
        }
      );
    }
    if (error instanceof MailSendError) {
      return NextResponse.json(
        { error: MAIL_SEND_PUBLIC_MESSAGE, code: 'MAIL_SEND_UNCONFIRMED' },
        { status: 502 }
      );
    }
    console.error('[mail] route failed', {
      error,
      wsId,
    });

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    budget?.close();
  }
}
