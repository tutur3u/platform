import type {
  RateLimitMode,
  RateLimitRule,
  RateLimitWriteBaseLimits,
} from '@tuturuuu/internal-api';

export function getModeTone(mode: RateLimitMode | string) {
  switch (mode) {
    case 'unlimited':
      return 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green';
    case 'absolute':
      return 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue';
    case 'blocked':
      return 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red';
    default:
      return 'border-border bg-muted text-muted-foreground';
  }
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

function formatTriple(minute: number, hour: number, day: number) {
  return `${minute.toLocaleString()}/min · ${hour.toLocaleString()}/hr · ${day.toLocaleString()}/day`;
}

/**
 * Describes the effective WRITE limits a rule produces, for admin preview. Reads
 * are scaled per-route at the proxy, so the multiplier/absolute also lifts reads.
 */
export function describeEffectiveWriteLimits(
  rule: Pick<
    RateLimitRule,
    'limit_mode' | 'trust_multiplier' | 'absolute_limits'
  >,
  base: RateLimitWriteBaseLimits
): string {
  if (rule.limit_mode === 'unlimited') {
    return 'Unlimited';
  }
  if (rule.limit_mode === 'blocked') {
    return 'Blocked (all writes denied)';
  }
  if (rule.limit_mode === 'absolute') {
    const write = rule.absolute_limits?.write;
    if (write && (write.minute || write.hour || write.day)) {
      return formatTriple(
        write.minute ?? base.userIp.minute,
        write.hour ?? base.userIp.hour,
        write.day ?? base.userIp.day
      );
    }
    return 'Absolute (no write windows set)';
  }
  const multiplier = rule.trust_multiplier || 1;
  return `${multiplier}× → ${formatTriple(
    Math.max(1, Math.floor(base.userIp.minute * multiplier)),
    Math.max(1, Math.floor(base.userIp.hour * multiplier)),
    Math.max(1, Math.floor(base.userIp.day * multiplier))
  )}`;
}

/** Short read-limit hint for the preview (per-route base × multiplier). */
export function describeReadEffect(
  rule: Pick<
    RateLimitRule,
    'limit_mode' | 'trust_multiplier' | 'absolute_limits'
  >
): string {
  if (rule.limit_mode === 'unlimited') {
    return 'Reads: uncapped at the edge';
  }
  if (rule.limit_mode === 'blocked') {
    return 'Reads: unaffected (writes only)';
  }
  if (rule.limit_mode === 'absolute') {
    const read = rule.absolute_limits?.read;
    if (read && (read.minute || read.hour || read.day)) {
      return `Reads: ${[
        read.minute != null ? `${read.minute}/min` : null,
        read.hour != null ? `${read.hour}/hr` : null,
        read.day != null ? `${read.day}/day` : null,
      ]
        .filter(Boolean)
        .join(' · ')} per route`;
    }
    return 'Reads: unaffected';
  }
  const multiplier = rule.trust_multiplier || 1;
  return multiplier > 1
    ? `Reads: ${multiplier}× the per-route limit`
    : 'Reads: standard per-route limit';
}
