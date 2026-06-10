import { type NextRequest, NextResponse } from 'next/server';
import { removeWebAccount } from '@/lib/auth/multi-account/vault';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  try {
    return NextResponse.json(await removeWebAccount(request, accountId));
  } catch {
    return NextResponse.json(
      { error: 'Failed to remove account' },
      { status: 500 }
    );
  }
}
