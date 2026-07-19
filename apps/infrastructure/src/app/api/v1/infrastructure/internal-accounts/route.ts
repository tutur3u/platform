import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInternalAccountRequest } from '@/lib/internal-accounts/authorization';
import {
  InternalAccountAdminError,
  listInternalAccountUsers,
} from '@/lib/internal-accounts/service';

const QuerySchema = z.object({
  q: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
});

export async function GET(request: Request) {
  await connection();

  const authorization = await authorizeInternalAccountRequest(request);
  if (!authorization.ok) return authorization.response;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get('q') || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid internal account query' },
      { status: 400 }
    );
  }

  try {
    const result = await listInternalAccountUsers({
      actorUserId: authorization.user.id,
      q: parsed.data.q,
      sbAdmin: authorization.sbAdmin,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InternalAccountAdminError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status }
      );
    }

    console.error('Unexpected internal account list failure');
    return NextResponse.json(
      { message: 'Unable to load internal accounts' },
      { status: 500 }
    );
  }
}
