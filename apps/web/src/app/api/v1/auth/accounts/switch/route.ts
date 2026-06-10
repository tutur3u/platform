import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { switchWebAccount } from '@/lib/auth/multi-account/vault';

const switchSchema = z.object({
  accountId: z.string().min(1).max(200),
  currentRoute: z.string().max(2048).nullable().optional(),
  targetRoute: z.string().max(2048).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = switchSchema.safeParse(
      await request.json().catch(() => null)
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { accountId, ...payload } = parsed.data;
    const result = await switchWebAccount(request, accountId, payload);
    return NextResponse.json(result, { status: result.success ? 200 : 410 });
  } catch {
    return NextResponse.json(
      { error: 'Failed to switch account' },
      { status: 500 }
    );
  }
}
