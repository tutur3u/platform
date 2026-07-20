import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeInternalAccountRequest } from '@/lib/internal-accounts/authorization';
import {
  InternalAccountAdminError,
  listInternalAccountUsers,
} from '@/lib/internal-accounts/service';

const QuerySchema = z.object({
  activeOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(48).optional(),
  q: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
  sortBy: z
    .enum(['createdAt', 'displayName', 'email', 'lastSignInAt'])
    .optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  verifiedOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export async function GET(request: Request) {
  await connection();

  const authorization = await authorizeInternalAccountRequest(request);
  if (!authorization.ok) return authorization.response;

  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    activeOnly: url.searchParams.get('activeOnly') || undefined,
    cursor: url.searchParams.get('cursor') || undefined,
    limit: url.searchParams.get('limit') || undefined,
    q: url.searchParams.get('q') || undefined,
    sortBy: url.searchParams.get('sortBy') || undefined,
    sortDirection: url.searchParams.get('sortDirection') || undefined,
    verifiedOnly: url.searchParams.get('verifiedOnly') || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid internal account query' },
      { status: 400 }
    );
  }

  try {
    const result = await listInternalAccountUsers({
      ...parsed.data,
      actorUserId: authorization.user.id,
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
