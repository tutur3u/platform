import { type NextRequest, NextResponse } from 'next/server';
import { listWebAccounts } from '@/lib/auth/multi-account/vault';

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listWebAccounts(request));
  } catch {
    return NextResponse.json(
      { accounts: [], activeAccountId: null, error: 'Failed to load accounts' },
      { status: 500 }
    );
  }
}
