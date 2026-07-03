import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { listCheckoutOrderHistory } from '@tuturuuu/inventory-core/commerce/checkouts';

const SearchParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  storeSlug: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
});

export async function GET(request: Request) {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: {
      targetApp: ['storefront', 'inventory'],
    },
  });

  if (!auth.ok) return auth.response;

  const parsed = SearchParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const { limit, offset, storeSlug } = parsed.data;
    const result = await listCheckoutOrderHistory({
      customerAuthUid: auth.user.id,
      limit,
      offset,
      storeSlug,
    });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    serverLogger.error('Failed to load inventory order history', error);
    return NextResponse.json(
      { message: 'Failed to load order history' },
      { status: 500 }
    );
  }
}
