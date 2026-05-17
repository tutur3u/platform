import type {
  AbuseRiskTier,
  AbuseSignalType,
} from '@tuturuuu/internal-api/infrastructure';

export function getTierTone(tier: AbuseRiskTier | string) {
  switch (tier) {
    case 'trusted':
      return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
    case 'watch':
      return 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow';
    case 'challenge_required':
      return 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange';
    case 'restricted':
      return 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

export function getSignalTone(signal: AbuseSignalType | string) {
  switch (signal) {
    case 'organic_activity':
    case 'challenge_passed':
      return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
    case 'challenge_issued':
    case 'missing_user_agent':
      return 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow';
    case 'automation_client':
    case 'challenge_failed':
    case 'payload_abuse':
    case 'rate_limit_hit':
      return 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
}

export function formatPercent(value: number | null) {
  if (value == null) {
    return '-';
  }

  return `${Math.round(value * 100)}%`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
