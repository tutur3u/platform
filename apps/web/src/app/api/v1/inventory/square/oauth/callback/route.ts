import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { completeInventorySquareOAuthCallback } from '@/lib/inventory/commerce/square';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const squareError = url.searchParams.get('error');

  if (squareError) {
    const redirect = new URL('/?square=oauth_error', url.origin);
    return NextResponse.redirect(redirect);
  }

  if (!code || !state) {
    return NextResponse.json(
      { message: 'Missing Square OAuth callback parameters' },
      { status: 400 }
    );
  }

  try {
    const result = await completeInventorySquareOAuthCallback({
      code,
      origin: url.origin,
      state,
    });
    const redirect = new URL(result.returnTo || '/', url.origin);
    redirect.searchParams.set('square', 'connected');
    return NextResponse.redirect(redirect);
  } catch (error) {
    serverLogger.error('Failed to complete Square OAuth callback', error);
    const redirect = new URL('/?square=oauth_error', url.origin);
    return NextResponse.redirect(redirect);
  }
}
