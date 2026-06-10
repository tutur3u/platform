import { NextResponse } from 'next/server';
import {
  authorizeMobileDeploymentAdmin,
  validateJsonMutation,
} from '@/lib/mobile-deployment/access';
import {
  MobileDeploymentStoreError,
  rollbackMobileDeploymentVersion,
} from '@/lib/mobile-deployment/store';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const mutationError = validateJsonMutation(request);
  if (mutationError) {
    return mutationError;
  }

  const access = await authorizeMobileDeploymentAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  try {
    await request.json().catch(() => ({}));
    return NextResponse.json(
      await rollbackMobileDeploymentVersion({
        db: access.db,
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
      { message: 'Failed to roll back mobile deployment version' },
      { status: 500 }
    );
  }
}
