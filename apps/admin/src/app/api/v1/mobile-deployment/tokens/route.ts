import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeMobileDeploymentAdmin,
  validateJsonMutation,
} from '@/lib/mobile-deployment/access';
import {
  MOBILE_DEPLOYMENT_PLATFORMS,
  type MobileDeploymentPlatform,
} from '@/lib/mobile-deployment/constants';
import {
  issueMobileDeploymentCiToken,
  MobileDeploymentStoreError,
} from '@/lib/mobile-deployment/store';

const IssueTokenSchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(365).default(90),
  name: z.string().trim().min(1).max(120),
  platforms: z
    .array(z.enum(MOBILE_DEPLOYMENT_PLATFORMS))
    .min(1)
    .default(['android', 'ios']),
});

export async function POST(request: Request) {
  const mutationError = validateJsonMutation(request);
  if (mutationError) {
    return mutationError;
  }

  const access = await authorizeMobileDeploymentAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = IssueTokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { errors: parsed.error.issues, message: 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      await issueMobileDeploymentCiToken({
        db: access.db,
        expiresInDays: parsed.data.expiresInDays,
        name: parsed.data.name,
        platforms: parsed.data.platforms as MobileDeploymentPlatform[],
        userId: access.userId,
      })
    );
  } catch (error) {
    if (error instanceof MobileDeploymentStoreError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { message: 'Failed to issue mobile deployment CI token' },
      { status: 500 }
    );
  }
}
