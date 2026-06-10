import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  authorizeMobileDeploymentAdmin,
  validateSameOriginMutation,
} from '@/lib/mobile-deployment/access';
import {
  MobileDeploymentStoreError,
  revokeMobileDeploymentCiToken,
} from '@/lib/mobile-deployment/store';

export const runtime = 'nodejs';

const ParamsSchema = z.object({
  tokenId: z.guid(),
});

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const mutationError = validateSameOriginMutation(request);
  if (mutationError) {
    return mutationError;
  }

  const access = await authorizeMobileDeploymentAdmin(request);
  if (!access.ok) {
    return access.response;
  }

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid token id' }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await revokeMobileDeploymentCiToken({
        db: access.db,
        tokenId: parsed.data.tokenId,
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
      { message: 'Failed to revoke mobile deployment CI token' },
      { status: 500 }
    );
  }
}
