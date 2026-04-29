import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createClient } from '@tuturuuu/supabase/next/server';
import {
  extractIPFromHeaders,
  resetOtpLimitsForEmail,
} from '@tuturuuu/utils/abuse-protection';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { validateEmail } from '@tuturuuu/utils/email/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ResetOtpLimitsSchema = z
  .object({
    email: z.string().min(1),
    reason: z.string().trim().max(500).optional(),
    clearEmailScoped: z.boolean(),
    clearRelatedIpCounters: z.boolean(),
    clearRelatedIpBlocks: z.boolean(),
  })
  .refine(
    (value) =>
      value.clearEmailScoped ||
      value.clearRelatedIpCounters ||
      value.clearRelatedIpBlocks,
    {
      message: 'At least one reset option is required',
      path: ['clearEmailScoped'],
    }
  );

async function authorizeInfrastructureAdmin(request: Request) {
  const supabase = await createClient(request);
  const { user } = await resolveAuthenticatedSessionUser(supabase);

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    request,
  });
  if (!permissions || permissions.withoutPermission('view_infrastructure')) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeInfrastructureAdmin(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const payload = ResetOtpLimitsSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json(
      { message: 'Invalid request body', errors: payload.error.issues },
      { status: 400 }
    );
  }

  try {
    const normalizedEmail = await validateEmail(payload.data.email);
    const result = await resetOtpLimitsForEmail({
      email: normalizedEmail,
      clearEmailScoped: payload.data.clearEmailScoped,
      clearRelatedIpCounters: payload.data.clearRelatedIpCounters,
      clearRelatedIpBlocks: payload.data.clearRelatedIpBlocks,
      adminUserId: authorization.user.id,
      reason: payload.data.reason,
      adminIpAddress: extractIPFromHeaders(request.headers),
    });

    return NextResponse.json({
      message: 'OTP limits reset successfully',
      ...result,
      relatedIpCount: result.relatedIps.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to reset OTP limits';
    return NextResponse.json({ message }, { status: 400 });
  }
}
