import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashExternalChatSecret } from '@/lib/external-chat/crypto';
import { consumeExternalChatPairingTicket } from '@/lib/external-chat/store';
import { safeParseBody } from '@/lib/safe-parse-body';

const pairingSchema = z.object({
  bindingId: z.string().uuid(),
  ticket: z.string().min(24).max(512),
});

export async function POST(request: Request) {
  const body = await safeParseBody(request as never, 2048);
  if (body instanceof NextResponse) return body;
  const parsed = pairingSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const valid = await consumeExternalChatPairingTicket(
    parsed.data.bindingId,
    hashExternalChatSecret(parsed.data.ticket)
  );
  if (!valid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
