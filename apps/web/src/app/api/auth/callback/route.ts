import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  // Get returnUrl, nextUrl, and multiAccount from query parameters
  const returnUrl = requestUrl.searchParams.get('returnUrl');
  const nextUrl = requestUrl.searchParams.get('nextUrl');
  const multiAccount = requestUrl.searchParams.get('multiAccount') === 'true';

  if (code) {
    // Create and await the Supabase client
    const supabase = await createClient();
    // Exchange the code for a session
    await supabase.auth.exchangeCodeForSession(code);
  }

  // If in multi-account mode, redirect to the add-account page
  if (multiAccount) {
    const addAccountUrl = new URL('/add-account', requestUrl.origin);
    if (returnUrl) {
      addAccountUrl.searchParams.set('returnUrl', returnUrl);
    }
    return NextResponse.redirect(addAccountUrl);
  }

  // Determine the redirect URL after authentication
  let redirectTo: string;

  if (returnUrl) {
    try {
      const decodedUrl = decodeURIComponent(returnUrl);

      // Check if it's a relative path (same domain)
      if (decodedUrl.startsWith('/')) {
        // Relative paths are valid for same-domain redirects
        redirectTo = decodedUrl;
        console.log('[auth/callback] Using relative returnUrl:', redirectTo);
      } else {
        // Absolute URLs need validation
        new URL(decodedUrl); // This will throw if invalid
        redirectTo = decodedUrl;
        console.log('[auth/callback] Using absolute returnUrl:', redirectTo);
      }
    } catch (error) {
      console.error('[auth/callback] Invalid returnUrl:', error);
      // Fall back to nextUrl or default
      redirectTo = nextUrl ? `/${nextUrl}` : '/onboarding';
    }
  } else {
    // Use nextUrl or fall back to default
    redirectTo = nextUrl ? `/${nextUrl}` : '/onboarding';
  }

  // Redirect to the determined URL
  return NextResponse.redirect(
    redirectTo.startsWith('http')
      ? redirectTo
      : new URL(redirectTo, requestUrl.origin)
  );
}
