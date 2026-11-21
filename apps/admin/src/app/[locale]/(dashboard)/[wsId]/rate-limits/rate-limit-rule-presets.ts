import type {
  RateLimitActionPresetKey,
  RateLimitMode,
} from '@tuturuuu/internal-api';
import type { AbuseRiskTier } from '@tuturuuu/utils/abuse-protection';

export type RateLimitRulePresetKey = Exclude<
  RateLimitActionPresetKey,
  'clear_ip_only'
>;

export type RateLimitRulePreset = {
  defaultDays: number | null;
  defaultMultiplier: number;
  isAdvanced?: boolean;
  key: RateLimitRulePresetKey;
  limitMode: RateLimitMode;
  tier: AbuseRiskTier;
};

export const RATE_LIMIT_RULE_PRESETS: RateLimitRulePreset[] = [
  {
    defaultDays: 30,
    defaultMultiplier: 3,
    key: 'trusted_workspace',
    limitMode: 'inherit_multiplier',
    tier: 'trusted',
  },
  {
    defaultDays: 7,
    defaultMultiplier: 5,
    key: 'event_or_classroom',
    limitMode: 'inherit_multiplier',
    tier: 'trusted',
  },
  {
    defaultDays: 30,
    defaultMultiplier: 10,
    key: 'extended_trusted',
    limitMode: 'inherit_multiplier',
    tier: 'trusted',
  },
  {
    defaultDays: null,
    defaultMultiplier: 1,
    isAdvanced: true,
    key: 'custom',
    limitMode: 'inherit_multiplier',
    tier: 'trusted',
  },
];

export function getRateLimitRulePreset(key: RateLimitRulePresetKey) {
  return RATE_LIMIT_RULE_PRESETS.find((preset) => preset.key === key);
}

export function getPresetExpiresAt(days: number | null) {
  if (!days) {
    return null;
  }

  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
