import { type NextRequest, NextResponse } from 'next/server';
import { logoutCurrentWebAccount } from '@/lib/auth/multi-account/vault';

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await logoutCurrentWebAccount(request));
  } catch {
    return NextResponse.json(
      { error: 'Failed to log out account' },
      { status: 500 }
    );
  }
}
