import type { FEATURE_TIERS } from './feature-tier-policy';
/** Source-backed feature inventory. Preview is availability, never an upgrade promise.
 * Navigation and feature-tiers.ts own capabilities; capacity rows identify pending rollout.
 * Internal services share the host workspace budget and are not separately sold. */
export type ComparisonTier = 'free' | 'plus' | 'pro' | 'enterprise';
export const COMPARISON_TIERS: ComparisonTier[] = [
  'free',
  'plus',
  'pro',
  'enterprise',
];
export interface ComparisonFeature {
  id: string;
  app: string;
  category: string;
  values: [string, string, string, string];
  detail: string;
  pending?: boolean;
  gate?: keyof typeof FEATURE_TIERS;
}
