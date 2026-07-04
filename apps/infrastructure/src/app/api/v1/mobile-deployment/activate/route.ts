import { NextResponse } from 'next/server';
import {
  authorizeMobileDeploymentAdmin,
  validateJsonMutation,
} from '@/lib/mobile-deployment/access';
import {
  activateMobileDeploymentDraft,
  MobileDeploymentStoreError,
} from '@/lib/mobile-deployment/store';

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
      await activateMobileDeploymentDraft({
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
      { message: 'Failed to activate mobile deployment version' },
      { status: 500 }
    );
  }
}
