import { connection, type NextRequest, NextResponse } from 'next/server';
import { resolveLoginView } from '@/app/[locale]/(auth)/login/login-view.server';

/**
 * The login page's per-visitor view. The page shell stays cacheable; this
 * response names the visitor's session and saved accounts, so it is private
 * and never stored.
 */
export async function GET(request: NextRequest) {
  await connection();

  return NextResponse.json(await resolveLoginView(request), {
    headers: {
      'Cache-Control': 'private, no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      Vary: 'Cookie',
    },
  });
}
