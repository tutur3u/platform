import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { z } from 'zod';
import { defineRoute } from '../registry';

const empty = z.object({}).strict();
export const metadataInput = z.object({
  params: empty,
  query: empty,
  body: z.null(),
});
export const metadataLimits = {
  bodyBytes: 0,
  deadlineMs: 3000,
  ratePolicy: 'metadata-read',
};
declare const __API_BUILD_SHA__: string;
const buildSha =
  typeof __API_BUILD_SHA__ === 'undefined' ? 'local' : __API_BUILD_SHA__;

export const health = defineRoute({
  operationId: 'getHealth',
  method: 'GET',
  path: '/api/health',
  aliases: [],
  policy: { kind: 'public' },
  guard: 'metadata',
  limits: metadataLimits,
  input: metadataInput,
  output: z.object({ status: z.literal('ok') }).strict(),
  body: 'none',
  status: 200,
  handle: () => ({ status: 'ok' as const }),
});

export const buildInfo = defineRoute({
  operationId: 'getBuildInfo',
  method: 'GET',
  path: '/api/build-info',
  aliases: [],
  policy: { kind: 'public' },
  guard: 'metadata',
  limits: metadataLimits,
  input: metadataInput,
  output: z
    .object({
      appName: z.string(),
      version: z.string(),
      builtAt: z.string(),
      commitHash: z.string(),
      commitMessage: z.string(),
      deploymentStamp: z.string().nullable(),
      deploymentUrl: z.string().nullable(),
      environment: z.string(),
      refName: z.string(),
      shortCommitHash: z.string(),
    })
    .strict(),
  body: 'none',
  status: 200,
  handle: () =>
    getPlatformReleaseInfo('api', {
      PLATFORM_BUILD_COMMIT_HASH: buildSha,
      PLATFORM_BUILD_ENVIRONMENT: 'cloudflare-worker',
      PLATFORM_BUILD_COMMIT_SHORT_HASH:
        buildSha === 'local' ? 'local' : buildSha.slice(0, 7),
    }),
});
