import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database, Json } from '@tuturuuu/types';
import {
  classifyPotentialSpamUserAgent,
  extractUserAgentFromHeaders,
} from './user-agent';

export const ABUSE_RISK_TIERS = [
  'trusted',
  'standard',
  'watch',
  'challenge_required',
  'restricted',
] as const;

export type AbuseRiskTier = (typeof ABUSE_RISK_TIERS)[number];

export const ABUSE_REPUTATION_SUBJECT_TYPES = [
  'user',
  'session',
  'api_key',
  'ip',
  'cidr',
  'user_location',
] as const;

export type AbuseReputationSubjectType =
  (typeof ABUSE_REPUTATION_SUBJECT_TYPES)[number];

export type AbuseSignalType =
  | 'organic_activity'
  | 'automation_client'
  | 'scripted_client'
  | 'missing_user_agent'
  | 'auth_failure'
  | 'rate_limit_hit'
  | 'client_error'
  | 'payload_abuse'
  | 'challenge_issued'
  | 'challenge_passed'
  | 'challenge_failed'
  | 'manual_override';

export interface AbuseRiskSubject {
  subject_key: string;
  subject_type: AbuseReputationSubjectType;
}

export interface AbuseRiskDecision {
  confidenceScore: number;
  decisionSource: 'default' | 'heuristic' | 'override' | 'reputation';
  reasons: string[];
  riskScore: number;
  subjectKey: string | null;
  subjects: AbuseRiskSubject[];
  tier: AbuseRiskTier;
  trustMultiplier: number;
}

export interface RateLimitDecision extends AbuseRiskDecision {
  adjustedMaxRequests: number;
}

export interface ResolveAbuseRiskDecisionInput {
  apiKeyId?: string | null;
  authKind: 'api-key' | 'app-session' | 'session' | 'temp';
  headers: Headers | Map<string, string> | Record<string, string | null>;
  ipAddress?: string | null;
  isRead: boolean;
  method: string;
  route: string;
  userCreatedAt?: string | null;
  userId?: string | null;
  workspaceId?: string | null;
}

export interface RecordAbuseActivitySignalInput {
  apiKeyId?: string | null;
  confidenceDelta?: number;
  headers?: Headers | Map<string, string> | Record<string, string | null>;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
  method?: string | null;
  reasonCode?: string | null;
  riskTier?: AbuseRiskTier;
  route?: string | null;
  scoreDelta?: number;
  signalType: AbuseSignalType;
  subjects: AbuseRiskSubject[];
  userId?: string | null;
  workspaceId?: string | null;
}

export interface RecordAbuseStepUpChallengeInput {
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
  riskTier?: AbuseRiskTier;
  route?: string | null;
  status: 'expired' | 'failed' | 'issued' | 'passed';
  subjectKey: string;
  userId?: string | null;
}

type TrustDecisionRow = {
  decision_source: string | null;
  subject_key: string | null;
  tier: AbuseRiskTier | null;
  trust_multiplier: number | string | null;
};

const HASH_PREFIX_LENGTH = 24;
const DEFAULT_DECISION: Omit<AbuseRiskDecision, 'subjects'> = {
  confidenceScore: 0,
  decisionSource: 'default',
  reasons: [],
  riskScore: 50,
  subjectKey: null,
  tier: 'standard',
  trustMultiplier: 1,
};

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeIpAddress(value?: string | null) {
  const normalized = value?.trim();
  return normalized && normalized !== 'unknown' ? normalized : null;
}

function hashStableSubject(value: string) {
  return createHash('sha256')
    .update(value)
    .digest('hex')
    .slice(0, HASH_PREFIX_LENGTH);
}

function parseCookieHeader(cookieHeader: string | null | undefined) {
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(';')
    .map((entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex < 0) {
        return null;
      }

      return {
        name: entry.slice(0, separatorIndex).trim(),
        value: entry.slice(separatorIndex + 1).trim(),
      };
    })
    .filter(
      (entry): entry is { name: string; value: string } =>
        !!entry?.name && !!entry.value
    );
}

function readHeader(
  headers: Headers | Map<string, string> | Record<string, string | null>,
  name: string
) {
  if (headers instanceof Headers) {
    return headers.get(name) ?? headers.get(name.toLowerCase()) ?? null;
  }

  if (headers instanceof Map) {
    return headers.get(name) ?? headers.get(name.toLowerCase()) ?? null;
  }

  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function getSessionSubjectKey(
  headers: Headers | Map<string, string> | Record<string, string | null>
) {
  const cookies = parseCookieHeader(readHeader(headers, 'cookie'));
  const authCookie = cookies.find(
    (cookie) =>
      cookie.name === 'tuturuuu_app_session' ||
      /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i.test(cookie.name)
  );

  if (!authCookie) {
    return null;
  }

  return `session:${hashStableSubject(`${authCookie.name}:${authCookie.value}`)}`;
}

function getCidrSubjectKey(ipAddress: string | null) {
  if (!ipAddress) {
    return null;
  }

  const ipv4Parts = ipAddress.split('.');
  if (
    ipv4Parts.length === 4 &&
    ipv4Parts.every((part) => /^\d{1,3}$/.test(part))
  ) {
    return `cidr:${ipv4Parts.slice(0, 3).join('.')}.0/24`;
  }

  const ipv6Parts = ipAddress.split(':').filter(Boolean);
  if (ipv6Parts.length >= 4) {
    return `cidr:${ipv6Parts.slice(0, 4).join(':')}::/64`;
  }

  return null;
}

function isLikelyBrowserUserAgent(userAgent: string | null) {
  return (
    !!userAgent &&
    /\b(?:mozilla\/5\.0|applewebkit|chrome\/|firefox\/|safari\/|edg\/)\b/i.test(
      userAgent
    )
  );
}

function getAccountAgeDays(userCreatedAt?: string | null) {
  if (!userCreatedAt) {
    return null;
  }

  const createdAt = new Date(userCreatedAt).getTime();
  if (!Number.isFinite(createdAt)) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000));
}

function normalizeTrustDecisionRow(row?: TrustDecisionRow | null) {
  if (!row?.tier) {
    return null;
  }

  const multiplier =
    typeof row.trust_multiplier === 'string'
      ? Number.parseFloat(row.trust_multiplier)
      : row.trust_multiplier;

  return {
    decisionSource:
      row.decision_source === 'override' || row.decision_source === 'reputation'
        ? row.decision_source
        : 'default',
    subjectKey: row.subject_key ?? null,
    tier: row.tier,
    trustMultiplier:
      Number.isFinite(multiplier) && multiplier && multiplier > 0
        ? multiplier
        : 1,
  } as const;
}

async function getSupabaseAdmin(): Promise<SupabaseClient<Database> | null> {
  try {
    const { createAdminClient } = await import(
      '@tuturuuu/supabase/next/server'
    );
    return (await createAdminClient({
      noCookie: true,
    })) as SupabaseClient<Database>;
  } catch {
    return null;
  }
}

export function buildAbuseRiskSubjects({
  apiKeyId,
  headers,
  ipAddress,
  userId,
}: Pick<
  ResolveAbuseRiskDecisionInput,
  'apiKeyId' | 'headers' | 'ipAddress' | 'userId'
>): AbuseRiskSubject[] {
  const subjects: AbuseRiskSubject[] = [];
  const normalizedIp = normalizeIpAddress(ipAddress);
  const sessionKey = getSessionSubjectKey(headers);
  const cidrKey = getCidrSubjectKey(normalizedIp);

  if (userId) {
    subjects.push({ subject_type: 'user', subject_key: `user:${userId}` });
  }

  if (sessionKey) {
    subjects.push({ subject_type: 'session', subject_key: sessionKey });
  }

  if (apiKeyId) {
    subjects.push({
      subject_type: 'api_key',
      subject_key: `api-key:${apiKeyId}`,
    });
  }

  if (normalizedIp) {
    subjects.push({ subject_type: 'ip', subject_key: `ip:${normalizedIp}` });

    if (userId) {
      subjects.push({
        subject_type: 'user_location',
        subject_key: `user-location:${userId}:${normalizedIp}`,
      });
    }
  }

  if (cidrKey) {
    subjects.push({ subject_type: 'cidr', subject_key: cidrKey });
  }

  return subjects;
}

async function loadServerTrustDecision({
  apiKeyId,
  ipAddress,
  userId,
}: Pick<ResolveAbuseRiskDecisionInput, 'apiKeyId' | 'ipAddress' | 'userId'>) {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc(
      'get_rate_limit_trust_decision',
      {
        p_api_key_id: apiKeyId ?? undefined,
        p_ip_address: normalizeIpAddress(ipAddress) ?? undefined,
        p_user_id: userId ?? undefined,
      }
    );

    if (error) {
      return null;
    }

    return normalizeTrustDecisionRow(
      Array.isArray(data) ? (data[0] as TrustDecisionRow | undefined) : null
    );
  } catch {
    return null;
  }
}

export async function resolveAbuseRiskDecision(
  input: ResolveAbuseRiskDecisionInput
): Promise<AbuseRiskDecision> {
  const subjects = buildAbuseRiskSubjects(input);
  const userAgent = extractUserAgentFromHeaders(input.headers);
  const userAgentClassification = classifyPotentialSpamUserAgent(userAgent, {
    allowNativeAppUserAgents: input.authKind === 'api-key',
  });
  const serverDecision = await loadServerTrustDecision(input);
  const accountAgeDays = getAccountAgeDays(input.userCreatedAt);
  const reasons: string[] = [];
  let riskScore = 50;
  let confidenceScore = 10;
  let tier = serverDecision?.tier ?? DEFAULT_DECISION.tier;
  let trustMultiplier =
    serverDecision?.trustMultiplier ?? DEFAULT_DECISION.trustMultiplier;
  let decisionSource: AbuseRiskDecision['decisionSource'] =
    serverDecision?.decisionSource ?? DEFAULT_DECISION.decisionSource;
  let subjectKey = serverDecision?.subjectKey ?? DEFAULT_DECISION.subjectKey;

  if (serverDecision) {
    confidenceScore += 25;
    if (serverDecision.tier === 'trusted') {
      riskScore += 30;
      reasons.push('server_reputation_trusted');
    } else if (serverDecision.tier === 'restricted') {
      riskScore -= 40;
      reasons.push('server_reputation_restricted');
    } else if (serverDecision.tier === 'challenge_required') {
      riskScore -= 25;
      reasons.push('server_reputation_challenge_required');
    } else if (serverDecision.tier === 'watch') {
      riskScore -= 10;
      reasons.push('server_reputation_watch');
    }
  }

  if (!userAgent) {
    riskScore -= 18;
    confidenceScore += 12;
    reasons.push('missing_user_agent');
  } else if (userAgentClassification.riskLevel === 'block') {
    const reason = userAgentClassification.reason ?? 'suspicious_user_agent';
    riskScore -= input.authKind === 'api-key' ? 8 : 28;
    confidenceScore += input.authKind === 'api-key' ? 8 : 20;
    reasons.push(reason);
  }

  if (accountAgeDays != null) {
    if (accountAgeDays >= 60) {
      riskScore += 12;
      confidenceScore += 12;
      reasons.push('established_account');
    } else if (accountAgeDays <= 1) {
      riskScore -= 8;
      confidenceScore += 6;
      reasons.push('new_account');
    }
  }

  const likelyBrowser = isLikelyBrowserUserAgent(userAgent);
  const suspiciousBrowserMutation =
    !input.isRead &&
    input.authKind !== 'api-key' &&
    (!likelyBrowser || userAgentClassification.riskLevel === 'block');

  if (suspiciousBrowserMutation && tier !== 'restricted') {
    tier = 'challenge_required';
    trustMultiplier = 1;
    decisionSource = 'heuristic';
    subjectKey ??= subjects[0]?.subject_key ?? null;
    reasons.push('suspicious_browser_mutation');
  } else if (
    tier === 'trusted' &&
    userAgentClassification.riskLevel === 'block'
  ) {
    tier = 'standard';
    trustMultiplier = 1;
    decisionSource = 'heuristic';
    reasons.push('trusted_tier_suppressed_by_current_signal');
  } else if (!serverDecision) {
    if (riskScore <= 15 && confidenceScore >= 20) {
      tier = 'restricted';
      trustMultiplier = 0.35;
      decisionSource = 'heuristic';
    } else if (riskScore <= 30 && confidenceScore >= 20) {
      tier = 'challenge_required';
      trustMultiplier = 1;
      decisionSource = 'heuristic';
    } else if (riskScore <= 45 && confidenceScore >= 10) {
      tier = 'watch';
      trustMultiplier = 0.75;
      decisionSource = 'heuristic';
    }
  }

  return {
    confidenceScore: clampScore(confidenceScore),
    decisionSource,
    reasons,
    riskScore: clampScore(riskScore),
    subjectKey,
    subjects,
    tier,
    trustMultiplier,
  };
}

export function applyRateLimitDecision(
  maxRequests: number,
  decision: Pick<AbuseRiskDecision, 'trustMultiplier'>
): RateLimitDecision['adjustedMaxRequests'] {
  return Math.max(1, Math.floor(maxRequests * decision.trustMultiplier));
}

export function buildRateLimitDecision(
  maxRequests: number,
  decision: AbuseRiskDecision
): RateLimitDecision {
  return {
    ...decision,
    adjustedMaxRequests: applyRateLimitDecision(maxRequests, decision),
  };
}

export async function recordAbuseActivitySignal({
  apiKeyId,
  confidenceDelta = 0,
  ipAddress,
  metadata,
  method,
  reasonCode,
  riskTier = 'standard',
  route,
  scoreDelta = 0,
  signalType,
  subjects,
  userId,
  workspaceId,
}: RecordAbuseActivitySignalInput): Promise<void> {
  if (subjects.length === 0) {
    return;
  }

  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  try {
    await supabase.rpc('record_abuse_activity_signal', {
      p_api_key_id: apiKeyId ?? undefined,
      p_confidence_delta: confidenceDelta,
      p_ip_address: normalizeIpAddress(ipAddress) ?? undefined,
      p_metadata: (metadata ?? {}) as Json,
      p_method: method ?? undefined,
      p_reason_code: reasonCode ?? undefined,
      p_risk_tier: riskTier,
      p_route: route ?? undefined,
      p_score_delta: scoreDelta,
      p_signal_type: signalType,
      p_subjects: subjects as unknown as Json,
      p_user_id: userId ?? undefined,
      p_workspace_id: workspaceId ?? undefined,
    });
  } catch {
    // Reputation logging must never block the protected request path.
  }
}

export async function recordAbuseStepUpChallenge({
  ipAddress,
  metadata,
  riskTier = 'challenge_required',
  route,
  status,
  subjectKey,
  userId,
}: RecordAbuseStepUpChallengeInput): Promise<void> {
  const supabase = await getSupabaseAdmin();
  if (!supabase) {
    return;
  }

  try {
    await supabase.from('abuse_step_up_challenges').insert({
      completed_at:
        status === 'passed' || status === 'failed'
          ? new Date().toISOString()
          : null,
      ip_address: normalizeIpAddress(ipAddress),
      metadata: (metadata ?? {}) as Json,
      risk_tier: riskTier,
      route: route ?? null,
      status,
      subject_key: subjectKey,
      user_id: userId ?? null,
    });
  } catch {
    // Challenge audit logging must never block the protected request path.
  }
}

export function getSignalForResponseStatus(status: number): {
  confidenceDelta: number;
  scoreDelta: number;
  signalType: AbuseSignalType;
} {
  if (status === 429) {
    return {
      confidenceDelta: 10,
      scoreDelta: -16,
      signalType: 'rate_limit_hit',
    };
  }

  if (status >= 400 && status < 500) {
    return {
      confidenceDelta: 4,
      scoreDelta: -4,
      signalType: 'client_error',
    };
  }

  return {
    confidenceDelta: 1,
    scoreDelta: 1,
    signalType: 'organic_activity',
  };
}
