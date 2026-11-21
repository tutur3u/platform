import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInternalAccountRequest } from '@/lib/internal-accounts/authorization';
import { authorizeMobileDeploymentAdmin } from '@/lib/mobile-deployment/access';
import { publishReviewerToApple } from '@/lib/review-accounts/apple-review';
import { ReviewAccountError } from '@/lib/review-accounts/service';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const Body = z.object({
  reviewerUserId: z.string().uuid(),
  email: z.string().email().max(320),
  password: z.string().min(12).max(128),
});

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (
    request.headers.get('x-tuturuuu-account-action') !== '1' ||
    request.headers.get('x-tuturuuu-mobile-deployment-action') !== '1' ||
    (origin && origin !== new URL(request.url).origin)
  ) {
    return NextResponse.json(
      { message: 'Same-origin administrator action required' },
      { headers, status: 403 }
    );
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json(
      { message: 'JSON body required' },
      { headers, status: 415 }
    );
  }
  const accounts = await authorizeInternalAccountRequest(request);
  if (!accounts.ok) return accounts.response;
  const vault = await authorizeMobileDeploymentAdmin(request);
  if (!vault.ok) return vault.response;
  if (vault.userId !== accounts.user.id) {
    return NextResponse.json(
      { message: 'Administrator identity mismatch' },
      { headers, status: 403 }
    );
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: 'Invalid reviewer details' },
      { headers, status: 400 }
    );
  try {
    const result = await publishReviewerToApple({
      db: vault.db,
      actorUserId: vault.userId,
      ...parsed.data,
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (error instanceof ReviewAccountError)
      return NextResponse.json(
        { message: error.message },
        { headers, status: error.status }
      );
    console.error('Apple reviewer metadata update failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { message: 'Unable to update Apple reviewer metadata' },
      { headers, status: 503 }
    );
  }
}
