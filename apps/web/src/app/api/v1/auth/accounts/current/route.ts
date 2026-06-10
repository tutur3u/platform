import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  saveCurrentWebAccount,
  updateCurrentWebAccount,
} from '@/lib/auth/multi-account/vault';

const saveSchema = z.object({
  returnUrl: z.string().max(2048).nullable().optional(),
  route: z.string().max(2048).nullable().optional(),
});

const updateSchema = z.object({
  route: z.string().max(2048).nullable().optional(),
  workspaceId: z.string().max(200).nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = saveSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const result = await saveCurrentWebAccount(request, parsed.data);
    return NextResponse.json(result, { status: result.success ? 200 : 401 });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save current account' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = updateSchema.safeParse(
      await request.json().catch(() => ({}))
    );

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      await updateCurrentWebAccount(request, parsed.data)
    );
  } catch {
    return NextResponse.json(
      { error: 'Failed to update account context' },
      { status: 500 }
    );
  }
}
