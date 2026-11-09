import { NextResponse } from 'next/server';
import { z } from 'zod';

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const platformParam = url.searchParams.get('platform');
  const buildParam = url.searchParams.get('build');

  const parsedQuery = z
    .object({
      platform: z.enum(['ios', 'android']),
      build: buildQuery,
    })
    .safeParse({ platform: platformParam, build: buildParam });

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error: {
          code: 'bad_request',
          message: 'Invalid request parameters',
        },
      },
      { status: 400, headers: { 'cache-control': 'no-store' } }
    );
  }

  const { platform, build } = parsedQuery.data;

  let config: unknown;
  try {
    config = JSON.parse(process.env.MOBILE_VERSION_POLICY ?? 'null');
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'unavailable',
          message: 'Invalid mobile version policy',
        },
      },
      { status: 503, headers: { 'cache-control': 'no-store' } }
    );
  }

  const parsed = versionPolicies.safeParse(config);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'unavailable',
          message: 'Missing mobile version policy',
        },
      },
      { status: 503, headers: { 'cache-control': 'no-store' } }
    );
  }

  const policy = parsed.data[platform];
  const requiresUpdate = build < policy.minimumSupportedBuild;
  const shouldUpdate = build < policy.latestBuild;

  return NextResponse.json(
    {
      platform,
      currentBuild: build,
      ...policy,
      requiresUpdate,
      shouldUpdate,
      status: requiresUpdate
        ? ('update-required' as const)
        : shouldUpdate
          ? ('update-recommended' as const)
          : ('supported' as const),
    },
    { status: 200, headers: { 'cache-control': 'no-store' } }
  );
}
