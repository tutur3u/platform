import {
  MAX_LONG_TEXT_LENGTH,
  MAX_NAME_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendAuthRecoveryEmail } from '@/lib/auth/recovery';
import { authorizeAbuseIntelligenceRequest } from '../../../abuse-intelligence/_shared';

const SendAuthRecoveryEmailSchema = z.object({
  locale: z.string().trim().min(2).max(MAX_NAME_LENGTH).optional(),
  next: z.string().trim().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
});

interface Params {
  params: Promise<{ overrideId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const authorization = await authorizeAbuseIntelligenceRequest(
    request,
    'manage_workspace_roles'
  );
  if (!authorization.ok) return authorization.response;

  const parsed = SendAuthRecoveryEmailSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request data' },
      { status: 400 }
    );
  }

  try {
    const { overrideId } = await params;
    const result = await sendAuthRecoveryEmail({
      actorUserId: authorization.user.id,
      locale: parsed.data.locale,
      next: parsed.data.next,
      overrideId,
      request,
    });
    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to send recovery email';
    return NextResponse.json({ message }, { status: 400 });
  }
}
