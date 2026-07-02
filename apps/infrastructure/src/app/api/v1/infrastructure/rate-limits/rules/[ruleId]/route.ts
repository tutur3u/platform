import type { Database, Json } from '@tuturuuu/types';
import {
  ABUSE_RISK_TIERS,
  RATE_LIMIT_MODES,
  recordAbuseActivitySignal,
} from '@tuturuuu/utils/abuse-protection';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { authorizeAbuseIntelligenceRequest } from '../../../abuse-intelligence/_shared';

const WindowLimitsSchema = z.object({
  day: z.number().int().positive().max(100_000_000).optional(),
  hour: z.number().int().positive().max(100_000_000).optional(),
  minute: z.number().int().positive().max(100_000_000).optional(),
});

const AbsoluteLimitsSchema = z.object({
  read: WindowLimitsSchema.optional(),
  write: WindowLimitsSchema.optional(),
});

type AbsoluteLimitsInput = z.infer<typeof AbsoluteLimitsSchema>;

const RATE_LIMIT_WINDOWS = ['minute', 'hour', 'day'] as const;

function hasConcreteAbsoluteLimits(
  absoluteLimits: AbsoluteLimitsInput | null | undefined
) {
  if (!absoluteLimits) {
    return false;
  }

  return (['read', 'write'] as const).some((scope) => {
    const limits = absoluteLimits[scope];
    return RATE_LIMIT_WINDOWS.some((window) => limits?.[window] != null);
  });
}

const UpdateRuleSchema = z
  .object({
    absoluteLimits: AbsoluteLimitsSchema.nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    limitMode: z.enum(RATE_LIMIT_MODES).optional(),
    reason: z.string().trim().min(1).max(MAX_SEARCH_LENGTH).optional(),
    tier: z.enum(ABUSE_RISK_TIERS).optional(),
    trustMultiplier: z.number().positive().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    const hasAbsoluteLimits = hasConcreteAbsoluteLimits(data.absoluteLimits);

    if (data.limitMode === 'absolute') {
      if (!hasAbsoluteLimits) {
        ctx.addIssue({
          code: 'custom',
          message:
            'absoluteLimits must include at least one read or write window when limitMode is "absolute"',
          path: ['absoluteLimits'],
        });
      }
      return;
    }

    if (data.absoluteLimits === null && data.limitMode === undefined) {
      ctx.addIssue({
        code: 'custom',
        message:
          'limitMode is required when clearing absolute rate-limit windows',
        path: ['limitMode'],
      });
    }

    if (data.absoluteLimits !== undefined && data.absoluteLimits !== null) {
      if (!hasAbsoluteLimits) {
        ctx.addIssue({
          code: 'custom',
          message:
            'absoluteLimits must include at least one read or write window',
          path: ['absoluteLimits'],
        });
      }

      if (data.limitMode !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'absoluteLimits can only be set when limitMode is "absolute"',
          path: ['absoluteLimits'],
        });
      }
    }
  });

const RevokeRuleSchema = z.object({
  reason: z.string().trim().min(1).max(MAX_SEARCH_LENGTH),
});

interface RouteContext {
  params: Promise<{ ruleId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizeAbuseIntelligenceRequest(
    request,
    'manage_workspace_roles'
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  const { ruleId } = await context.params;
  const parsed = UpdateRuleSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request data' },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const update: Database['public']['Tables']['abuse_trust_overrides']['Update'] =
    { updated_at: new Date().toISOString() };

  if (payload.tier !== undefined) {
    update.tier = payload.tier;
  }
  if (payload.limitMode !== undefined) {
    update.limit_mode = payload.limitMode;
    // Clearing absolute mode removes any stale absolute limits.
    if (payload.limitMode !== 'absolute') {
      update.absolute_limits = null;
    }
  }
  if (payload.trustMultiplier !== undefined) {
    update.trust_multiplier = payload.trustMultiplier;
  }
  if (payload.absoluteLimits !== undefined) {
    update.absolute_limits =
      payload.limitMode === undefined || payload.limitMode === 'absolute'
        ? (payload.absoluteLimits as Json)
        : null;
  }
  if (payload.expiresAt !== undefined) {
    update.expires_at = payload.expiresAt;
  }
  if (payload.reason !== undefined) {
    update.reason = payload.reason;
  }

  const { data, error } = await authorization.sbAdmin
    .from('abuse_trust_overrides')
    .update(update)
    .eq('id', ruleId)
    .is('revoked_at', null)
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Failed to update rate-limit rule', error);
    return NextResponse.json(
      { message: 'Failed to update rate-limit rule' },
      { status: 500 }
    );
  }

  return NextResponse.json({ rule: data });
}

export async function DELETE(request: Request, context: RouteContext) {
  const authorization = await authorizeAbuseIntelligenceRequest(
    request,
    'manage_workspace_roles'
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  const { ruleId } = await context.params;
  const parsed = RevokeRuleSchema.safeParse(await request.json());
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
    .eq('id', ruleId)
    .is('revoked_at', null)
    .select('*')
    .single();

  if (error) {
    serverLogger.error('Failed to revoke rate-limit rule', error);
    return NextResponse.json(
      { message: 'Failed to revoke rate-limit rule' },
      { status: 500 }
    );
  }

  void recordAbuseActivitySignal({
    confidenceDelta: 10,
    metadata: { reason: parsed.data.reason, revoked: true, ruleId },
    reasonCode: 'manual_override_revoked',
    riskTier: 'standard',
    scoreDelta: 0,
    signalType: 'manual_override',
    subjects: [
      { subject_key: data.subject_key, subject_type: data.subject_type },
    ],
    userId: authorization.user.id,
  });

  return NextResponse.json({ rule: data });
}
