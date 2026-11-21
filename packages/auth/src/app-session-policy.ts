import { z } from 'zod';

export const APP_COORDINATION_SESSION_POLICY_SECRET_NAME =
  'APP_COORDINATION_SESSION_POLICY';
export const APP_COORDINATION_SESSION_POLICY_CACHE_TTL_SECONDS = 60;

export const APP_COORDINATION_SESSION_POLICY_LIMITS = {
  browserRefreshReplayGraceSeconds: {
    defaultValue: 30,
    max: 300,
    min: 0,
  },
  cliAccessTtlSeconds: {
    defaultValue: 28_800,
    max: 86_400,
    min: 300,
  },
  cliRefreshTtlSeconds: {
    defaultValue: 7_776_000,
    max: 7_776_000,
    min: 86_400,
  },
  externalAppBearerTtlSeconds: {
    defaultValue: 28_800,
    max: 86_400,
    min: 300,
  },
  externalAppRefreshReplayGraceSeconds: {
    defaultValue: 30,
    max: 300,
    min: 0,
  },
  internalAppAccessTtlSeconds: {
    defaultValue: 28_800,
    max: 86_400,
    min: 300,
  },
  internalAppRefreshEarlySeconds: {
    defaultValue: 900,
    max: 7_200,
    min: 60,
  },
  internalAppRefreshTtlSeconds: {
    defaultValue: 2_592_000,
    max: 7_776_000,
    min: 86_400,
  },
} as const;

const appIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{1,64}$/u);

function boundedIntegerSchema(
  key: keyof typeof APP_COORDINATION_SESSION_POLICY_LIMITS
) {
  const limits = APP_COORDINATION_SESSION_POLICY_LIMITS[key];

  return z
    .number()
    .int()
    .min(limits.min)
    .max(limits.max)
    .default(limits.defaultValue);
}

function optionalBoundedIntegerSchema(
  key: keyof typeof APP_COORDINATION_SESSION_POLICY_LIMITS
) {
  const limits = APP_COORDINATION_SESSION_POLICY_LIMITS[key];

  return z.number().int().min(limits.min).max(limits.max).optional();
}

export const internalAppSessionPolicyOverrideSchema = z
  .object({
    internalAppAccessTtlSeconds: optionalBoundedIntegerSchema(
      'internalAppAccessTtlSeconds'
    ),
    internalAppRefreshEarlySeconds: optionalBoundedIntegerSchema(
      'internalAppRefreshEarlySeconds'
    ),
    internalAppRefreshTtlSeconds: optionalBoundedIntegerSchema(
      'internalAppRefreshTtlSeconds'
    ),
  })
  .strict();

export const appCoordinationSessionPolicySchema = z
  .object({
    browserRefreshReplayGraceSeconds: boundedIntegerSchema(
      'browserRefreshReplayGraceSeconds'
    ),
    cliAccessTtlSeconds: boundedIntegerSchema('cliAccessTtlSeconds'),
    cliRefreshTtlSeconds: boundedIntegerSchema('cliRefreshTtlSeconds'),
    externalAppBearerTtlSeconds: boundedIntegerSchema(
      'externalAppBearerTtlSeconds'
    ),
    externalAppRefreshReplayGraceSeconds: boundedIntegerSchema(
      'externalAppRefreshReplayGraceSeconds'
    ),
    internalAppAccessTtlSeconds: boundedIntegerSchema(
      'internalAppAccessTtlSeconds'
    ),
    internalAppOverrides: z
      .record(appIdSchema, internalAppSessionPolicyOverrideSchema)
      .default({}),
    internalAppRefreshEarlySeconds: boundedIntegerSchema(
      'internalAppRefreshEarlySeconds'
    ),
    internalAppRefreshTtlSeconds: boundedIntegerSchema(
      'internalAppRefreshTtlSeconds'
    ),
  })
  .strict();

export type InternalAppSessionPolicyOverride = z.infer<
  typeof internalAppSessionPolicyOverrideSchema
>;

export type AppCoordinationSessionPolicy = z.infer<
  typeof appCoordinationSessionPolicySchema
>;

export type ResolvedInternalAppSessionPolicy = {
  internalAppAccessTtlSeconds: number;
  internalAppRefreshEarlySeconds: number;
  internalAppRefreshTtlSeconds: number;
};

export const DEFAULT_APP_COORDINATION_SESSION_POLICY =
  appCoordinationSessionPolicySchema.parse({});

export function parseAppCoordinationSessionPolicy(value: unknown) {
  return appCoordinationSessionPolicySchema.parse(value ?? {});
}

export function safeParseAppCoordinationSessionPolicy(value: unknown) {
  return appCoordinationSessionPolicySchema.safeParse(value ?? {});
}

/**
 * Upper bounds no runtime policy can raise. The Mastermind Worker refuses
 * any access session longer than 300 seconds, so its issuer never mints
 * one, and its refresh credential lives at most a day (the Access session).
 */
export const FIXED_INTERNAL_APP_SESSION_CAPS: Readonly<
  Record<string, ResolvedInternalAppSessionPolicy>
> = {
  mastermind: {
    internalAppAccessTtlSeconds: 300,
    internalAppRefreshEarlySeconds: 60,
    internalAppRefreshTtlSeconds: 86_400,
  },
};

export function resolveInternalAppSessionPolicy(
  policy: AppCoordinationSessionPolicy,
  appId: string
): ResolvedInternalAppSessionPolicy {
  const normalizedAppId = appId.trim().toLowerCase();
  const override = policy.internalAppOverrides[normalizedAppId];
  const cap = FIXED_INTERNAL_APP_SESSION_CAPS[normalizedAppId];
  const capped = (
    key: keyof ResolvedInternalAppSessionPolicy,
    value: number
  ) => (cap ? Math.min(cap[key], value) : value);

  return {
    internalAppAccessTtlSeconds: capped(
      'internalAppAccessTtlSeconds',
      override?.internalAppAccessTtlSeconds ??
        policy.internalAppAccessTtlSeconds
    ),
    internalAppRefreshEarlySeconds: capped(
      'internalAppRefreshEarlySeconds',
      override?.internalAppRefreshEarlySeconds ??
        policy.internalAppRefreshEarlySeconds
    ),
    internalAppRefreshTtlSeconds: capped(
      'internalAppRefreshTtlSeconds',
      override?.internalAppRefreshTtlSeconds ??
        policy.internalAppRefreshTtlSeconds
    ),
  };
}
