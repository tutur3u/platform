import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  evaluateMobileVersionPolicy,
  getMobileVersionPolicies,
  isStrictSemver,
} from '@/lib/mobile-version-policy';
import { jsonWithCors, optionsWithCors } from '../../auth/mobile/shared';

const QuerySchema = z.object({
  platform: z.enum(['ios', 'android']),
  version: z.string().refine(isStrictSemver, {
    message: 'Version must use x.y.z format',
  }),
});

export async function GET(request: NextRequest) {
  const query = QuerySchema.safeParse({
    platform: request.nextUrl.searchParams.get('platform'),
    version: request.nextUrl.searchParams.get('version'),
  });

  if (!query.success) {
    return jsonWithCors(
      {
        error: query.error.issues[0]?.message ?? 'Invalid request parameters',
      },
      { status: 400 }
    );
  }

  try {
    const policies = await getMobileVersionPolicies();
    const result = evaluateMobileVersionPolicy({
      currentVersion: query.data.version,
      platform: query.data.platform,
      policies,
    });

    return jsonWithCors({ ...result });
  } catch (error) {
    console.error('Failed to evaluate mobile version policy:', error);
    return jsonWithCors(
      { error: 'Failed to evaluate mobile version policy' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return optionsWithCors();
}
