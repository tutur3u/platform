import { recordAbuseActivitySignal } from '@tuturuuu/utils/abuse-protection';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAbuseIntelligenceRequest } from '../../_shared';

const RevokeOverrideSchema = z.object({
  reason: z.string().trim().min(1).max(MAX_SEARCH_LENGTH),
});

interface RouteContext {
  params: Promise<{
    overrideId: string;
  }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizeAbuseIntelligenceRequest(
    request,
    'manage_workspace_roles'
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  const { overrideId } = await context.params;
  const parsed = RevokeOverrideSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request data' },
      { status: 400 }
    );
  }

  const { data, error } = await authorization.sbAdmin
    .from('abuse_trust_overrides')
    .update({
      revoke_reason: parsed.data.reason,
      revoked_at: new Date().toISOString(),
      revoked_by: authorization.user.id,
    })
    .eq('id', overrideId)
    .is('revoked_at', null)
    .select('*')
    .single();

  if (error) {
    console.error('Failed to revoke abuse trust override', error);
    return NextResponse.json(
      { message: 'Failed to revoke abuse trust override' },
      { status: 500 }
    );
  }

  void recordAbuseActivitySignal({
    confidenceDelta: 10,
    metadata: {
      overrideId,
      reason: parsed.data.reason,
      revoked: true,
    },
    reasonCode: 'manual_override_revoked',
    riskTier: 'standard',
    scoreDelta: 0,
    signalType: 'manual_override',
    subjects: [
      {
        subject_key: data.subject_key,
        subject_type: data.subject_type,
      },
    ],
    userId: authorization.user.id,
  });

  return NextResponse.json({ override: data });
}
