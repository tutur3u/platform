import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revokeAuthRecoveryOverride } from '@/lib/auth/recovery';
import { authorizeAbuseIntelligenceRequest } from '../../abuse-intelligence/_shared';

const RevokeAuthRecoveryOverrideSchema = z.object({
  reason: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
});

interface Params {
  params: Promise<{ overrideId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  const authorization = await authorizeAbuseIntelligenceRequest(
    request,
    'manage_workspace_roles'
  );
  if (!authorization.ok) return authorization.response;

  const parsed = RevokeAuthRecoveryOverrideSchema.safeParse(
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
    const override = await revokeAuthRecoveryOverride({
      actorUserId: authorization.user.id,
      overrideId,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ override });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to revoke override';
    return NextResponse.json({ message }, { status: 400 });
  }
}
