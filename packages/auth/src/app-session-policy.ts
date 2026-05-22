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

export function resolveInternalAppSessionPolicy(
  policy: AppCoordinationSessionPolicy,
  appId: string
): ResolvedInternalAppSessionPolicy {
  const normalizedAppId = appId.trim().toLowerCase();
  const override = policy.internalAppOverrides[normalizedAppId];

  return {
    internalAppAccessTtlSeconds:
      override?.internalAppAccessTtlSeconds ??
      policy.internalAppAccessTtlSeconds,
    internalAppRefreshEarlySeconds:
      override?.internalAppRefreshEarlySeconds ??
      policy.internalAppRefreshEarlySeconds,
    internalAppRefreshTtlSeconds:
      override?.internalAppRefreshTtlSeconds ??
      policy.internalAppRefreshTtlSeconds,
  };
}
