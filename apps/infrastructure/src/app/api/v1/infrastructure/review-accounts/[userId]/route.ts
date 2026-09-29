import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInternalAccountRequest } from '@/lib/internal-accounts/authorization';
import {
  ReviewAccountError,
  updateReviewAccount,
} from '@/lib/review-accounts/service';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const UpdateSchema = z.object({
  action: z.enum(['rotate_password', 'disable', 'enable']),
  confirmationEmail: z.string().trim().email(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const origin = request.headers.get('origin');
  if (
    request.headers.get('x-tuturuuu-account-action') !== '1' ||
    (origin && origin !== new URL(request.url).origin)
  ) {
    return NextResponse.json(
      { message: 'Same-origin account action required' },
      { headers, status: 403 }
    );
  }
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    return NextResponse.json(
      { message: 'JSON body required' },
      { headers, status: 415 }
    );
  }
  const access = await authorizeInternalAccountRequest(request);
  if (!access.ok) return access.response;
  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: 'Invalid account action' },
      { headers, status: 400 }
    );

  try {
    const { userId } = await params;
    const result = await updateReviewAccount({
      ...parsed.data,
      actorUserId: access.user.id,
      sbAdmin: access.sbAdmin,
      userId,
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof ReviewAccountError) {
      return NextResponse.json(
        { message: error.message },
        { headers, status: error.status }
      );
    }
    console.error('Review account update failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { message: 'Unable to update account' },
      { headers, status: 503 }
    );
  }
}
