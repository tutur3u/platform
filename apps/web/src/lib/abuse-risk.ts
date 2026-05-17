import {
  isTurnstileError,
  verifyTurnstileToken,
} from '@tuturuuu/turnstile/server';
import {
  type AbuseRiskDecision,
  type AbuseSignalType,
  buildRateLimitDecision,
  getSignalForResponseStatus,
  type RateLimitDecision,
  type ResolveAbuseRiskDecisionInput,
  recordAbuseActivitySignal,
  recordAbuseStepUpChallenge,
  resolveAbuseRiskDecision,
} from '@tuturuuu/utils/abuse-protection';
import { type NextRequest, NextResponse } from 'next/server';
import type { RateLimitConfig } from './rate-limit';

export interface WebAbuseDecisionInput
  extends Omit<ResolveAbuseRiskDecisionInput, 'headers'> {
  request: NextRequest;
}

export interface AdaptiveRateLimitConfig {
  config: RateLimitConfig;
  decision: RateLimitDecision;
}

function getTurnstileToken(request: NextRequest) {
  return (
    request.headers.get('x-tuturuuu-turnstile-token') ??
    request.headers.get('x-turnstile-token') ??
    undefined
  );
}

function getChallengeResponse() {
  return NextResponse.json(
    {
      code: 'ABUSE_CHALLENGE_REQUIRED',
      error: 'Forbidden',
      message: 'Additional verification is required before retrying.',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-Abuse-Challenge': 'turnstile',
      },
      status: 403,
    }
  );
}

export async function resolveWebAbuseDecision({
  request,
  ...input
}: WebAbuseDecisionInput): Promise<AbuseRiskDecision> {
  return resolveAbuseRiskDecision({
    ...input,
    headers: request.headers,
  });
}

export function getAdaptiveRateLimitConfig(
  config: RateLimitConfig,
  decision: AbuseRiskDecision
): AdaptiveRateLimitConfig {
  const rateLimitDecision = buildRateLimitDecision(
    config.maxRequests,
    decision
  );

  return {
    config: {
      ...config,
      maxRequestsMultiplier: decision.trustMultiplier,
    },
    decision: rateLimitDecision,
  };
}

export async function enforceAdaptiveStepUpChallenge({
  apiKeyId,
  decision,
  ipAddress,
  isRead,
  method,
  request,
  route,
  userId,
  workspaceId,
}: {
  apiKeyId?: string | null;
  decision: AbuseRiskDecision;
  ipAddress?: string | null;
  isRead: boolean;
  method: string;
  request: NextRequest;
  route: string;
  userId?: string | null;
  workspaceId?: string | null;
}): Promise<NextResponse | null> {
  if (isRead || decision.tier !== 'challenge_required' || apiKeyId) {
    return null;
  }

  const baseSignal = {
    apiKeyId,
    ipAddress,
    method,
    route,
    subjects: decision.subjects,
    userId,
    workspaceId,
  };

  const token = getTurnstileToken(request);
  if (!token) {
    void recordAbuseStepUpChallenge({
      ipAddress,
      metadata: {
        decisionSource: decision.decisionSource,
        tier: decision.tier,
      },
      route,
      status: 'issued',
      subjectKey:
        decision.subjectKey ?? decision.subjects[0]?.subject_key ?? 'unknown',
      userId,
    });
    void recordAbuseActivitySignal({
      ...baseSignal,
      confidenceDelta: 8,
      metadata: {
        decisionSource: decision.decisionSource,
        tier: decision.tier,
      },
      reasonCode: 'challenge_required',
      riskTier: decision.tier,
      scoreDelta: -4,
      signalType: 'challenge_issued',
    });
    return getChallengeResponse();
  }

  try {
    await verifyTurnstileToken(request, token, { remoteIp: ipAddress });
    void recordAbuseStepUpChallenge({
      ipAddress,
      metadata: {
        decisionSource: decision.decisionSource,
        tier: decision.tier,
      },
      route,
      status: 'passed',
      subjectKey:
        decision.subjectKey ?? decision.subjects[0]?.subject_key ?? 'unknown',
      userId,
    });
    void recordAbuseActivitySignal({
      ...baseSignal,
      confidenceDelta: 12,
      metadata: {
        decisionSource: decision.decisionSource,
        tier: decision.tier,
      },
      reasonCode: 'challenge_passed',
      riskTier: 'standard',
      scoreDelta: 18,
      signalType: 'challenge_passed',
    });
    return null;
  } catch (error) {
    const reasonCode = isTurnstileError(error)
      ? error.code
      : 'challenge_failed';
    void recordAbuseStepUpChallenge({
      ipAddress,
      metadata: {
        decisionSource: decision.decisionSource,
        reasonCode,
        tier: decision.tier,
      },
      route,
      status: 'failed',
      subjectKey:
        decision.subjectKey ?? decision.subjects[0]?.subject_key ?? 'unknown',
      userId,
    });
    void recordAbuseActivitySignal({
      ...baseSignal,
      confidenceDelta: 12,
      metadata: {
        decisionSource: decision.decisionSource,
        tier: decision.tier,
      },
      reasonCode,
      riskTier: decision.tier,
      scoreDelta: -18,
      signalType: 'challenge_failed',
    });
    return getChallengeResponse();
  }
}

export function recordResponseAbuseSignal({
  apiKeyId,
  decision,
  ipAddress,
  method,
  response,
  route,
  userId,
  workspaceId,
}: {
  apiKeyId?: string | null;
  decision: AbuseRiskDecision;
  ipAddress?: string | null;
  method: string;
  response: NextResponse;
  route: string;
  userId?: string | null;
  workspaceId?: string | null;
}) {
  const signal = getSignalForResponseStatus(response.status);
  const metadata: Record<string, unknown> = {
    decisionSource: decision.decisionSource,
    tier: decision.tier,
  };
  let signalType: AbuseSignalType = signal.signalType;

  if (
    signalType === 'organic_activity' &&
    decision.reasons.some((reason) =>
      ['known_automation_framework', 'scripted_http_client'].includes(reason)
    )
  ) {
    signalType = 'automation_client';
    metadata.originalSignal = 'organic_activity';
  }

  void recordAbuseActivitySignal({
    apiKeyId,
    confidenceDelta: signal.confidenceDelta,
    ipAddress,
    metadata,
    method,
    reasonCode: signalType,
    riskTier: decision.tier,
    route,
    scoreDelta: signal.scoreDelta,
    signalType,
    subjects: decision.subjects,
    userId,
    workspaceId,
  });
}
