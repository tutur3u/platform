import type { RateLimitRule } from '@tuturuuu/internal-api';
import type { Json } from '@tuturuuu/types';
import {
  ABUSE_REPUTATION_SUBJECT_TYPES,
  ABUSE_RISK_TIERS,
  RATE_LIMIT_MODES,
  recordAbuseActivitySignal,
} from '@tuturuuu/utils/abuse-protection';
import {
  readEdgeAbuseProtectionControls,
  writeEdgeAbuseProtectionControls,
} from '@tuturuuu/utils/abuse-protection/edge';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readEdgeTrustState } from '@/lib/infrastructure/rate-limit-redis-admin';
import { enrichRateLimitRules } from '@/lib/rate-limits/subject-resolution';
import {
  authorizeAbuseIntelligenceRequest,
  defaultTrustMultiplierForTier,
} from '../abuse-intelligence/_shared';

// Subject types whose rules drive the edge READ cache (cron/proxy). Used to
// resolve the per-rule "is this live at the edge yet?" propagation indicator.
const EDGE_CACHED_SUBJECT_TYPES = new Set([
  'session',
  'cidr',
  'ip',
  'workspace',
]);

// The fixed base WRITE limits enforced by the DB check_request() hook. Returned
// so the admin UI can preview effective limits (base x multiplier, or absolute).
const WRITE_BASE_LIMITS = {
  anonymous: { minute: 5, hour: 50, day: 100 },
  userIp: { minute: 20, hour: 200, day: 800 },
  userBackstop: { minute: 40, hour: 400, day: 1500 },
} as const;

type JsonObject = { [key: string]: Json | undefined };

const WindowLimitsSchema = z.object({
  day: z.number().int().positive().max(100_000_000).optional(),
  hour: z.number().int().positive().max(100_000_000).optional(),
  minute: z.number().int().positive().max(100_000_000).optional(),
});

const AbsoluteLimitsSchema = z.object({
  read: WindowLimitsSchema.optional(),
  write: WindowLimitsSchema.optional(),
});

const UpdateAbuseProtectionControlsSchema = z
  .object({
    ipBlockingEnabled: z.boolean().optional(),
    rateLimitsEnabled: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.ipBlockingEnabled !== undefined ||
      data.rateLimitsEnabled !== undefined,
    {
      message: 'At least one protection control must be provided',
    }
  );

const RATE_LIMIT_ACTION_PRESETS = [
  'clear_ip_only',
  'custom',
  'event_or_classroom',
  'extended_trusted',
  'trusted_workspace',
] as const;

export const CreateRateLimitRuleSchema = z
  .object({
    absoluteLimits: AbsoluteLimitsSchema.nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    limitMode: z.enum(RATE_LIMIT_MODES).default('inherit_multiplier'),
    metadata: z.record(z.string(), z.unknown()).optional(),
    presetKey: z.enum(RATE_LIMIT_ACTION_PRESETS).optional(),
    reason: z.string().trim().min(1).max(MAX_SEARCH_LENGTH),
    subjectKey: z.string().trim().min(1).max(256),
    subjectType: z.enum(ABUSE_REPUTATION_SUBJECT_TYPES),
    tier: z.enum(ABUSE_RISK_TIERS),
    trustMultiplier: z.number().positive().max(1000).optional(),
  })
  .refine(
    (data) =>
      data.limitMode !== 'absolute' ||
      !!(
        data.absoluteLimits &&
        (data.absoluteLimits.write || data.absoluteLimits.read)
      ),
    {
      message: 'absoluteLimits is required when limitMode is "absolute"',
      path: ['absoluteLimits'],
    }
  );

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function isJsonObject(value: Json): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRateLimitRuleRow(
  row: Omit<RateLimitRule, 'absolute_limits' | 'metadata'> & {
    absolute_limits: Json;
    metadata: Json;
  }
): RateLimitRule {
  return {
    ...row,
    absolute_limits: isJsonObject(row.absolute_limits)
      ? (row.absolute_limits as RateLimitRule['absolute_limits'])
      : null,
    metadata: isJsonObject(row.metadata) ? row.metadata : {},
  };
}

/** Resolves the trust multiplier to persist given the chosen mode/tier. */
function resolveTrustMultiplier(payload: {
  limitMode: string;
  tier: string;
  trustMultiplier?: number;
}): number {
  if (payload.trustMultiplier != null) {
    return payload.trustMultiplier;
  }
  return payload.limitMode === 'inherit_multiplier'
    ? defaultTrustMultiplierForTier(payload.tier)
    : 1;
}

export async function GET(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(request.url);
  const limit = parsePositiveInt(url.searchParams.get('limit'), 200, 500);
  const subjectTypeParam = url.searchParams.get('subjectType');
  const search = url.searchParams.get('q')?.trim();
  const includeRevoked = url.searchParams.get('includeRevoked') === 'true';

  let query = authorization.sbAdmin
    .from('abuse_trust_overrides')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!includeRevoked) {
    query = query.is('revoked_at', null);
  }
  if (
    subjectTypeParam &&
    (ABUSE_REPUTATION_SUBJECT_TYPES as readonly string[]).includes(
      subjectTypeParam
    )
  ) {
    query = query.eq(
      'subject_type',
      subjectTypeParam as (typeof ABUSE_REPUTATION_SUBJECT_TYPES)[number]
    );
  }
  const { data, error } = await query;

  if (error) {
    console.error('Failed to load rate-limit rules', error);
    return NextResponse.json(
      { message: 'Failed to load rate-limit rules' },
      { status: 500 }
    );
  }

  const enrichedRules = await enrichRateLimitRules(
    authorization.sbAdmin,
    (data ?? []).map(normalizeRateLimitRuleRow)
  );
  const normalizedSearch = search?.toLowerCase();
  const rules = normalizedSearch
    ? enrichedRules.filter((rule) =>
        [
          rule.subject_key,
          rule.reason,
          rule.subject?.label,
          rule.subject?.detail,
          rule.subject?.ip,
          rule.subject?.userId,
          rule.subject?.workspaceId,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch))
      )
    : enrichedRules;
  const byMode: Record<string, number> = {};
  const bySubjectType: Record<string, number> = {};
  for (const rule of rules) {
    byMode[rule.limit_mode] = (byMode[rule.limit_mode] ?? 0) + 1;
    bySubjectType[rule.subject_type] =
      (bySubjectType[rule.subject_type] ?? 0) + 1;
  }

  // Propagation indicator: which cache-eligible rules are live at the edge now.
  const cacheableKeys = rules
    .filter((rule) => EDGE_CACHED_SUBJECT_TYPES.has(rule.subject_type))
    .map((rule) => rule.subject_key);
  const edgeState = await readEdgeTrustState(cacheableKeys);
  const edgeCachedSubjectKeys = [...edgeState.keys()];
  const abuseProtectionControls = await readEdgeAbuseProtectionControls({
    allowCache: false,
  });

  return NextResponse.json({
    abuseProtectionControls,
    edgeCachedSubjectKeys,
    rules,
    summary: {
      blockedCount: byMode.blocked ?? 0,
      byMode,
      bySubjectType,
      total: rules.length,
      unlimitedCount: byMode.unlimited ?? 0,
    },
    writeBaseLimits: WRITE_BASE_LIMITS,
  });
}

export async function POST(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(
    request,
    'manage_workspace_roles'
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateRateLimitRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request data' },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const { data, error } = await authorization.sbAdmin
    .from('abuse_trust_overrides')
    .insert({
      absolute_limits:
        payload.limitMode === 'absolute'
          ? ((payload.absoluteLimits ?? null) as Json)
          : null,
      created_by: authorization.user.id,
      expires_at: payload.expiresAt ?? null,
      limit_mode: payload.limitMode,
      metadata: {
        ...(payload.metadata ?? {}),
        ...(payload.presetKey ? { preset_key: payload.presetKey } : {}),
      } as Json,
      reason: payload.reason,
      subject_key: payload.subjectKey,
      subject_type: payload.subjectType,
      tier: payload.tier,
      trust_multiplier: resolveTrustMultiplier(payload),
    })
    .select('*')
    .single();

  if (error) {
    console.error('Failed to create rate-limit rule', error);
    return NextResponse.json(
      { message: 'Failed to create rate-limit rule' },
      { status: 500 }
    );
  }

  void recordAbuseActivitySignal({
    confidenceDelta: 20,
    metadata: {
      limitMode: payload.limitMode,
      reason: payload.reason,
      ruleId: data.id,
    },
    reasonCode: 'manual_override',
    riskTier: payload.tier,
    scoreDelta: payload.tier === 'trusted' ? 30 : -20,
    signalType: 'manual_override',
    subjects: [
      { subject_key: payload.subjectKey, subject_type: payload.subjectType },
    ],
    userId: authorization.user.id,
  });

  return NextResponse.json({ rule: data });
}

export async function PATCH(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(
    request,
    'manage_workspace_roles'
  );
  if (!authorization.ok) {
    return authorization.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpdateAbuseProtectionControlsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request data' },
      { status: 400 }
    );
  }

  try {
    const abuseProtectionControls = await writeEdgeAbuseProtectionControls({
      ...parsed.data,
      updatedBy: authorization.user.id,
    });

    return NextResponse.json({
      abuseProtectionControls,
      message: 'Updated abuse protection controls.',
    });
  } catch (error) {
    console.error('Failed to update abuse protection controls', error);
    return NextResponse.json(
      { message: 'Failed to update abuse protection controls' },
      { status: 500 }
    );
  }
}
