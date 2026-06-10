import { type NextRequest, NextResponse } from 'next/server';
import { logoutAllWebAccounts } from '@/lib/auth/multi-account/vault';

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await logoutAllWebAccounts(request));
  } catch {
    return NextResponse.json(
      { error: 'Failed to log out accounts' },
      { status: 500 }
    );
  }
}
