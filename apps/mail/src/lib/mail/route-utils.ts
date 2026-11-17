import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { resolveMailRouteContext } from './auth';
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
  handler: (ctx: MailRouteContext) => Promise<NextResponse>
) {
  try {
    const resolved = await resolveMailRouteContext(request, wsId);
    if (!resolved.ok) return resolved.response;

    return await handler(resolved.context);
  } catch (error) {
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
  }
}
