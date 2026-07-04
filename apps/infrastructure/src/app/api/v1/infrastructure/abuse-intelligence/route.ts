import type { Json } from '@tuturuuu/types';
import {
  ABUSE_REPUTATION_SUBJECT_TYPES,
  ABUSE_RISK_TIERS,
  recordAbuseActivitySignal,
} from '@tuturuuu/utils/abuse-protection';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeAbuseIntelligenceRequest,
  defaultTrustMultiplierForTier,
} from './_shared';

const CreateOverrideSchema = z.object({
  expiresAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().min(1).max(MAX_SEARCH_LENGTH),
  subjectKey: z.string().trim().min(1).max(256),
  subjectType: z.enum(ABUSE_REPUTATION_SUBJECT_TYPES),
  tier: z.enum(ABUSE_RISK_TIERS),
  trustMultiplier: z.number().positive().max(5).optional(),
});

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function countByTier(
  subjects: Array<{ tier: string | null }>
): Record<string, number> {
  return subjects.reduce<Record<string, number>>((counts, subject) => {
    const tier = subject.tier ?? 'standard';
    counts[tier] = (counts[tier] ?? 0) + 1;
    return counts;
  }, {});
}

export async function GET(request: Request) {
  const authorization = await authorizeAbuseIntelligenceRequest(request);
  if (!authorization.ok) {
    return authorization.response;
  }

  const url = new URL(request.url);
  const limit = parsePositiveInt(url.searchParams.get('limit'), 100, 250);
  const signalLimit = parsePositiveInt(
    url.searchParams.get('signalLimit'),
    100,
    250
  );

  const { sbAdmin, supabase } = authorization;

  const [subjectsResult, signalsResult, challengesResult, overridesResult] =
    await Promise.all([
      supabase
        .from('abuse_reputation_subjects')
        .select('*')
        .order('last_seen_at', { ascending: false })
        .limit(limit),
      supabase
        .from('abuse_activity_signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(signalLimit),
      supabase
        .from('abuse_step_up_challenges')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      sbAdmin
        .from('abuse_trust_overrides')
        .select('*')
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

  const firstError =
    subjectsResult.error ??
    signalsResult.error ??
    challengesResult.error ??
    overridesResult.error;

  if (firstError) {
    console.error('Failed to load abuse intelligence snapshot', firstError);
    return NextResponse.json(
      { message: 'Failed to load abuse intelligence snapshot' },
      { status: 500 }
    );
  }

  const subjects = subjectsResult.data ?? [];
  const signals = signalsResult.data ?? [];
  const challenges = challengesResult.data ?? [];
  const overrides = overridesResult.data ?? [];
  const passedChallenges = challenges.filter(
    (challenge) => challenge.status === 'passed'
  ).length;
  const completedChallenges = challenges.filter((challenge) =>
    ['failed', 'passed'].includes(challenge.status)
  ).length;
  const tierCounts = countByTier(subjects);

  return NextResponse.json({
    challenges,
    overrides,
    signals,
    subjects,
    summary: {
      activeOverrideCount: overrides.length,
      challengePassRate:
        completedChallenges > 0 ? passedChallenges / completedChallenges : null,
      recentSignalCount: signals.length,
      restrictedSubjectCount: tierCounts.restricted ?? 0,
      tierCounts,
      totalSubjectCount: subjects.length,
      trustedSubjectCount: tierCounts.trusted ?? 0,
      watchedSubjectCount:
        (tierCounts.watch ?? 0) + (tierCounts.challenge_required ?? 0),
    },
    topRiskySubjects: [...subjects]
      .filter((subject) =>
        ['challenge_required', 'restricted', 'watch'].includes(subject.tier)
      )
      .sort(
        (left, right) =>
          left.reputation_score - right.reputation_score ||
          right.negative_signal_count - left.negative_signal_count
      )
      .slice(0, 10),
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

  const parsed = CreateOverrideSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request data' },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const trustMultiplier =
    payload.trustMultiplier ?? defaultTrustMultiplierForTier(payload.tier);

  const { data, error } = await authorization.sbAdmin
    .from('abuse_trust_overrides')
    .insert({
      created_by: authorization.user.id,
      expires_at: payload.expiresAt ?? null,
      metadata: (payload.metadata ?? {}) as Json,
      reason: payload.reason,
      subject_key: payload.subjectKey,
      subject_type: payload.subjectType,
      tier: payload.tier,
      trust_multiplier: trustMultiplier,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Failed to create abuse trust override', error);
    return NextResponse.json(
      { message: 'Failed to create abuse trust override' },
      { status: 500 }
    );
  }

  void recordAbuseActivitySignal({
    confidenceDelta: 20,
    metadata: {
      overrideId: data.id,
      reason: payload.reason,
    },
    reasonCode: 'manual_override',
    riskTier: payload.tier,
    scoreDelta: payload.tier === 'trusted' ? 30 : -20,
    signalType: 'manual_override',
    subjects: [
      {
        subject_key: payload.subjectKey,
        subject_type: payload.subjectType,
      },
    ],
    userId: authorization.user.id,
  });

  return NextResponse.json({ override: data });
}
