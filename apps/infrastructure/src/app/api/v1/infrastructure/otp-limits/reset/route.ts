import {
  extractIPFromHeaders,
  resetOtpLimitsForEmail,
} from '@tuturuuu/utils/abuse-protection';
import { validateEmail } from '@tuturuuu/utils/email/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';

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

export async function POST(request: NextRequest) {
  const authorization = await authorizeInfrastructureAdminRequest(
    'view_infrastructure'
  );
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
