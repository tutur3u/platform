import { createClient } from '@ncthub/supabase/next/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  // Get returnUrl and nextUrl from query parameters
  const returnUrl = requestUrl.searchParams.get('returnUrl');
  const nextUrl = requestUrl.searchParams.get('nextUrl');

  // Determine the redirect URL after authentication
  let redirectTo: string;

  if (returnUrl) {
    try {
      // Validate the returnUrl to ensure it's a proper URL
      const decodedUrl = decodeURIComponent(returnUrl);
      new URL(decodedUrl); // This will throw if invalid
      redirectTo = decodedUrl;
    } catch (error) {
      console.error('Invalid returnUrl:', error);
      // Fall back to nextUrl or default
      redirectTo = nextUrl ? `/${nextUrl}` : '/onboarding';
    }
  } else {
    // Use nextUrl or fall back to default
    redirectTo = nextUrl ? `/${nextUrl}` : '/onboarding';
  }

  if (code) {
    // Create and await the Supabase client
    const supabase = await createClient();
    // Exchange the code for a session
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Redirect to the determined URL
  return NextResponse.redirect(
    redirectTo.startsWith('http')
      ? redirectTo
      : new URL(redirectTo, requestUrl.origin)
  );
}
