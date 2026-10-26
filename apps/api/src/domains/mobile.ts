import { z } from 'zod';
import { ApiError } from '../errors';
import { defineRoute } from '../registry';
import { metadataLimits } from './metadata';

const platformPolicy = z
  .object({
    minimumSupportedBuild: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    latestBuild: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    storeUrl: z.url().refine((value) => new URL(value).protocol === 'https:'),
  })
  .strict()
  .refine((value) => value.latestBuild >= value.minimumSupportedBuild);
const versionPolicies = z
  .object({ ios: platformPolicy, android: platformPolicy })
  .strict();
const buildQuery = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .transform(Number)
  .pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER));

export const mobileVersion = defineRoute({
  operationId: 'getMobileVersion',
  method: 'GET',
  path: '/api/v1/mobile/version',
  aliases: [],
  policy: { kind: 'public' },
  guard: 'metadata',
  limits: metadataLimits,
  input: z.object({
    params: z.object({}).strict(),
    query: z
      .object({ platform: z.enum(['ios', 'android']), build: buildQuery })
      .strict(),
    body: z.null(),
  }),
  output: z
    .object({
      platform: z.enum(['ios', 'android']),
      currentBuild: z.number().int(),
      minimumSupportedBuild: z.number().int(),
      latestBuild: z.number().int(),
      storeUrl: z.url(),
      requiresUpdate: z.boolean(),
      shouldUpdate: z.boolean(),
      status: z.enum(['supported', 'update-recommended', 'update-required']),
    })
    .strict(),
  body: 'none',
  status: 200,
  handle: ({ query }, { env }) => {
    let config: unknown;
    try {
      config = JSON.parse(env.MOBILE_VERSION_POLICY ?? 'null');
    } catch {
      throw new ApiError('unavailable', 503, 'Invalid mobile version policy');
    }
    const parsed = versionPolicies.safeParse(config);
    if (!parsed.success)
      throw new ApiError('unavailable', 503, 'Missing mobile version policy');
    const policy = parsed.data[query.platform];
    const requiresUpdate = query.build < policy.minimumSupportedBuild;
    const shouldUpdate = query.build < policy.latestBuild;
    return {
      platform: query.platform,
      currentBuild: query.build,
      ...policy,
      requiresUpdate,
      shouldUpdate,
      status: requiresUpdate
        ? ('update-required' as const)
        : shouldUpdate
          ? ('update-recommended' as const)
          : ('supported' as const),
    };
  },
});
