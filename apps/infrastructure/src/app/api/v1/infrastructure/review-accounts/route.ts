import { MAX_EMAIL_LENGTH } from '@tuturuuu/utils/constants';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInternalAccountRequest } from '@/lib/internal-accounts/authorization';
import {
  createReviewAccount,
  listReviewAccounts,
  ReviewAccountError,
} from '@/lib/review-accounts/service';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

const CreateSchema = z.object({
  email: z.string().trim().email().max(MAX_EMAIL_LENGTH),
  displayName: z.string().trim().min(2).max(100),
  kind: z.enum(['review', 'external']),
});

function validateMutation(request: Request) {
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
  return null;
}

export async function GET(request: Request) {
  await connection();
  const access = await authorizeInternalAccountRequest(request);
  if (!access.ok) return access.response;
  try {
    return NextResponse.json(
      { accounts: await listReviewAccounts(access.sbAdmin) },
      { headers }
    );
  } catch (error) {
    console.error('Review account list failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { message: 'Unable to load review accounts' },
      { headers, status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const mutationError = validateMutation(request);
  if (mutationError) return mutationError;
  const access = await authorizeInternalAccountRequest(request);
  if (!access.ok) return access.response;
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { message: 'Invalid account details' },
      { headers, status: 400 }
    );

  try {
    const result = await createReviewAccount({
      ...parsed.data,
      actorUserId: access.user.id,
      sbAdmin: access.sbAdmin,
    });
    return NextResponse.json(result, { headers, status: 201 });
  } catch (error) {
    if (error instanceof ReviewAccountError) {
      return NextResponse.json(
        { message: error.message },
        { headers, status: error.status }
      );
    }
    console.error('Review account creation failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { message: 'Unable to create account' },
      { headers, status: 503 }
    );
  }
}
