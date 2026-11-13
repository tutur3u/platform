export interface FeatureAudienceUser {
  readonly id: string;
  readonly email?: string | null;
  readonly email_confirmed_at?: string | null;
  readonly is_anonymous?: boolean;
}
interface RolloutMetadata {
  readonly owner: string;
  readonly removeBy: string;
}
export type FeatureRollout = RolloutMetadata &
  (
    | {
        readonly stage: 'internal';
        readonly emailDomainAllowlist?: readonly string[];
      }
    | {
        readonly stage: 'rollout';
        readonly audience:
          | { readonly kind: 'percentage'; readonly percentage: number }
          | {
              readonly kind: 'workspaces';
              readonly workspaceIds: readonly string[];
            };
      }
    | { readonly stage: 'ga' }
  );
export interface FeatureAudienceContext {
  readonly user: FeatureAudienceUser | null;
  readonly workspace: { readonly id: string } | null;
  readonly permissionGranted: boolean;
}
export interface FeatureAudienceConfiguration {
  readonly enabledFlags: Readonly<Partial<Record<string, boolean>>>;
  readonly rollouts: Readonly<Partial<Record<string, FeatureRollout>>>;
}
export declare const DEFAULT_FEATURE_EMAIL_DOMAINS: readonly string[];
export declare const FEATURE_ROLLOUT_STAGES: readonly FeatureRollout['stage'][];
export declare function validateFeatureRollout(value: unknown): string[];
export declare function isInternalFeatureAudience(
  user: FeatureAudienceUser | null,
  domains?: readonly string[]
): boolean;
export declare function isFeatureEnabled(
  key: string,
  context: FeatureAudienceContext,
  configuration: FeatureAudienceConfiguration
): boolean;
