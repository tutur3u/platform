import type { Json } from '@tuturuuu/types';
import {
  recordAbuseActivitySignal,
  unblockIP,
} from '@tuturuuu/utils/abuse-protection';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  enrichRateLimitAppeals,
  verifyWorkspaceAppealMembership,
} from '@/lib/rate-limits/subject-resolution';
import { authorizeAbuseIntelligenceRequest } from '../../abuse-intelligence/_shared';

const RATE_LIMIT_ACTION_PRESETS = [
  'clear_ip_only',
  'custom',
  'event_or_classroom',
  'extended_trusted',
  'trusted_workspace',
] as const;

const ApproveSchema = z.object({
  action: z.literal('approve'),
  allowWorkspaceMismatch: z.boolean().default(false),
  createWorkspaceRule: z.boolean().default(true),
  expiresInDays: z.number().int().positive().max(365).default(30),
  presetKey: z.enum(RATE_LIMIT_ACTION_PRESETS).optional(),
  reviewNote: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
  trustMultiplier: z.number().positive().max(1000).default(3),
  workspaceId: z.string().uuid().nullable().optional(),
});

const RejectSchema = z.object({
  action: z.literal('reject'),
  reviewNote: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
});

const CloseSchema = z.object({
  action: z.literal('close'),
  reviewNote: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
});

const ActionSchema = z.discriminatedUnion('action', [
  ApproveSchema,
  RejectSchema,
  CloseSchema,
]);

interface RouteContext {
  params: Promise<{ appealId: string }>;
}

function rateLimitAppealsTable(client: unknown) {
  return (client as { from: (table: string) => any }).from(
    'rate_limit_appeals'
  );
}

async function loadAppeal(client: unknown, appealId: string) {
  const { data, error } = await rateLimitAppealsTable(client)
    .select('*')
    .eq('id', appealId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function findActiveBlockedIpId(client: unknown, ipAddress: string) {
  const { data } = await (client as { from: (table: string) => any })
    .from('blocked_ips')
    .select('id')
    .eq('ip_address', ipAddress)
    .eq('status', 'active')
    .order('blocked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

function buildReviewNote(defaultNote: string, reviewNote?: string) {
  return (reviewNote?.trim() || defaultNote).slice(0, MAX_SEARCH_LENGTH);
}

async function createWorkspaceTrustedRule(args: {
  allowWorkspaceMismatch?: boolean;
  client: unknown;
  appeal: any;
  expiresInDays: number;
  presetKey?: string;
  reviewNote?: string;
  reviewerId: string;
  trustMultiplier: number;
  workspaceMembershipVerified: boolean;
  workspaceId: string;
}) {
  const expiresAt = new Date(
    Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const subjectKey = `workspace:${args.workspaceId.toLowerCase()}`;
  const reason = buildReviewNote(
    `Approved rate-limit appeal ${args.appeal.id}`,
    args.reviewNote
  );

  const { data, error } = await (
    args.client as { from: (table: string) => any }
  )
    .from('abuse_trust_overrides')
    .insert({
      absolute_limits: null,
      created_by: args.reviewerId,
      expires_at: expiresAt,
      limit_mode: 'inherit_multiplier',
      metadata: {
        allow_workspace_mismatch: !!args.allowWorkspaceMismatch,
        approved_from_rate_limit_appeal: true,
        appeal_id: args.appeal.id,
        client_ip: args.appeal.client_ip,
        preset_key: args.presetKey ?? null,
        user_id: args.appeal.creator_id,
        workspace_membership_verified: args.workspaceMembershipVerified,
      } satisfies Json,
      reason,
      subject_key: subjectKey,
      subject_type: 'workspace',
      tier: 'trusted',
      trust_multiplier: args.trustMultiplier,
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  void recordAbuseActivitySignal({
    confidenceDelta: 20,
    metadata: {
      appealId: args.appeal.id,
      expiresAt,
      limitMode: 'inherit_multiplier',
      presetKey: args.presetKey,
      reason,
      ruleId: data.id,
      source: 'rate_limit_appeal',
      workspaceMembershipVerified: args.workspaceMembershipVerified,
    },
    reasonCode: 'rate_limit_appeal_approved',
    riskTier: 'trusted',
    scoreDelta: 30,
    signalType: 'manual_override',
    subjects: [{ subject_key: subjectKey, subject_type: 'workspace' }],
    userId: args.reviewerId,
  });

  return data;
}

async function updateAppealReview(args: {
  appealId: string;
  client: unknown;
  clearedBlockedIpId?: string | null;
  createdRuleId?: string | null;
  reviewNote?: string;
  reviewerId: string;
  status: 'approved' | 'closed' | 'rejected';
}) {
  const { data, error } = await rateLimitAppealsTable(args.client)
    .update({
      cleared_blocked_ip_id: args.clearedBlockedIpId ?? null,
      created_rate_limit_rule_id: args.createdRuleId ?? null,
      review_note: args.reviewNote ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: args.reviewerId,
      status: args.status,
    })
    .eq('id', args.appealId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function GET(request: Request, context: RouteContext) {
  const authorization = await authorizeAbuseIntelligenceRequest(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const { appealId } = await context.params;
  const parsedId = z.string().uuid().safeParse(appealId);
  if (!parsedId.success) {
    return NextResponse.json({ message: 'Invalid appeal ID' }, { status: 400 });
  }

  try {
    const appeal = await loadAppeal(authorization.sbAdmin, appealId);
    const [enrichedAppeal] = await enrichRateLimitAppeals(
      authorization.sbAdmin,
      [appeal]
    );
    return NextResponse.json({ appeal: enrichedAppeal ?? appeal });
  } catch (error) {
    console.error('Failed to load rate-limit appeal', error);
    return NextResponse.json(
      { message: 'Failed to load rate-limit appeal' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authorization = await authorizeAbuseIntelligenceRequest(
    request,
    'manage_workspace_roles'
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  const { appealId } = await context.params;
  const parsedId = z.string().uuid().safeParse(appealId);
  if (!parsedId.success) {
    return NextResponse.json({ message: 'Invalid appeal ID' }, { status: 400 });
  }

  let payload: z.infer<typeof ActionSchema>;
  try {
    payload = ActionSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { errors: error.issues, message: 'Invalid request data' },
        { status: 400 }
      );
    }

    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const appeal = await loadAppeal(authorization.sbAdmin, appealId);
    if (payload.action !== 'close' && appeal.status !== 'pending') {
      return NextResponse.json(
        { message: 'Only pending appeals can be reviewed' },
        { status: 409 }
      );
    }

    if (payload.action === 'reject' || payload.action === 'close') {
      const updatedAppeal = await updateAppealReview({
        appealId,
        client: authorization.sbAdmin,
        reviewNote: payload.reviewNote,
        reviewerId: authorization.user.id,
        status: payload.action === 'reject' ? 'rejected' : 'closed',
      });
      const [enrichedAppeal] = await enrichRateLimitAppeals(
        authorization.sbAdmin,
        [updatedAppeal]
      );

      return NextResponse.json({
        appeal: enrichedAppeal ?? updatedAppeal,
        rule: null,
        unblocked: false,
      });
    }

    const workspaceId = payload.workspaceId ?? appeal.workspace_id;
    if (payload.createWorkspaceRule && !workspaceId) {
      return NextResponse.json(
        {
          message:
            'A workspace ID is required to create the trusted workspace uplift',
        },
        { status: 400 }
      );
    }

    let workspaceMembershipVerified = false;
    if (payload.createWorkspaceRule && workspaceId) {
      const workspaceReview = await verifyWorkspaceAppealMembership({
        appeal,
        client: authorization.sbAdmin,
        workspaceId,
      });

      if (!workspaceReview.workspaceExists) {
        return NextResponse.json(
          { message: 'Selected workspace was not found' },
          { status: 400 }
        );
      }

      workspaceMembershipVerified = workspaceReview.membershipVerified;
      if (
        !workspaceReview.membershipVerified &&
        !payload.allowWorkspaceMismatch
      ) {
        return NextResponse.json(
          {
            message:
              'Requester is not verified as a member of this workspace. Use the advanced override to approve anyway.',
          },
          { status: 409 }
        );
      }
    }

    const clearedBlockedIpId = await findActiveBlockedIpId(
      authorization.sbAdmin,
      appeal.client_ip
    );
    const reviewNote = buildReviewNote(
      `Approved rate-limit appeal ${appeal.id}`,
      payload.reviewNote
    );
    const unblocked = await unblockIP(
      appeal.client_ip,
      authorization.user.id,
      reviewNote
    );
    if (!unblocked) {
      return NextResponse.json(
        { message: 'Failed to unblock IP' },
        { status: 500 }
      );
    }

    const rule =
      payload.createWorkspaceRule && workspaceId
        ? await createWorkspaceTrustedRule({
            allowWorkspaceMismatch: payload.allowWorkspaceMismatch,
            appeal,
            client: authorization.sbAdmin,
            expiresInDays: payload.expiresInDays,
            presetKey: payload.presetKey,
            reviewNote,
            reviewerId: authorization.user.id,
            trustMultiplier: payload.trustMultiplier,
            workspaceMembershipVerified,
            workspaceId,
          })
        : null;

    const updatedAppeal = await updateAppealReview({
      appealId,
      clearedBlockedIpId,
      client: authorization.sbAdmin,
      createdRuleId: rule?.id ?? null,
      reviewNote,
      reviewerId: authorization.user.id,
      status: 'approved',
    });
    const [enrichedAppeal] = await enrichRateLimitAppeals(
      authorization.sbAdmin,
      [updatedAppeal]
    );

    return NextResponse.json({
      appeal: enrichedAppeal ?? updatedAppeal,
      rule,
      unblocked: true,
    });
  } catch (error) {
    console.error('Failed to update rate-limit appeal', error);
    return NextResponse.json(
      { message: 'Failed to update rate-limit appeal' },
      { status: 500 }
    );
  }
}
