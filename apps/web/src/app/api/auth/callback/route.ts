import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const queryParamsSchema = z.object({
  code: z.string().optional(),
  returnUrl: z.string().optional(),
  nextUrl: z.string().optional(),
  multiAccount: z
    .string()
    .transform((val) => val === 'true')
    .pipe(z.boolean())
    .optional()
    .default(false),
});

/**
 * Validates a redirect URL to prevent open redirects.
 * Only allows relative paths or same-origin absolute URLs.
 */
function validateRedirectUrl(
  encodedUrl: string,
  requestOrigin: string
): string | null {
  try {
    const decodedUrl = decodeURIComponent(encodedUrl);

    // Relative paths are always safe
    if (decodedUrl.startsWith('/')) {
      return decodedUrl;
    }

    // Validate absolute URLs
    const url = new URL(decodedUrl);

    // Only allow http/https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    // Only allow same-origin URLs
    if (url.origin !== requestOrigin) {
      return null;
    }

    return decodedUrl;
  } catch {
    // Invalid URL format
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);

  // Parse and validate query parameters
  const parseResult = queryParamsSchema.safeParse({
    code: requestUrl.searchParams.get('code'),
    returnUrl: requestUrl.searchParams.get('returnUrl'),
    nextUrl: requestUrl.searchParams.get('nextUrl'),
    multiAccount: requestUrl.searchParams.get('multiAccount'),
  });

  if (!parseResult.success) {
    console.error('[auth/callback] Invalid query parameters:', parseResult.error);
    return NextResponse.redirect(new URL('/onboarding', requestUrl.origin));
  }

  const { code, returnUrl, nextUrl, multiAccount } = parseResult.data;

  // Normalize nextUrl by removing leading slashes to avoid double slashes
  const normalizedNextUrl = nextUrl?.replace(/^\/+/, '');

  if (code) {
    try {
      // Create and await the Supabase client
      const supabase = await createClient();
      // Exchange the code for a session
      await supabase.auth.exchangeCodeForSession(code);
    } catch (error) {
      // Log error server-side only (not in response)
      console.error('[auth/callback] Failed to exchange code for session:', error);
      // Return safe error response without leaking details
      return NextResponse.redirect(
        new URL('/login?error=auth_failed', requestUrl.origin)
      );
    }
  }

  // If in multi-account mode, redirect to the add-account page
  if (multiAccount) {
    const addAccountUrl = new URL('/add-account', requestUrl.origin);
    if (returnUrl) {
      // Validate returnUrl before passing it along
      const validatedUrl = validateRedirectUrl(returnUrl, requestUrl.origin);
      if (validatedUrl) {
        addAccountUrl.searchParams.set('returnUrl', encodeURIComponent(validatedUrl));
      }
    }
    return NextResponse.redirect(addAccountUrl);
  }

  // Determine the redirect URL after authentication
  let redirectTo: string;

  if (returnUrl) {
    const validatedUrl = validateRedirectUrl(returnUrl, requestUrl.origin);
    if (validatedUrl) {
      redirectTo = validatedUrl;
    } else {
      // Invalid or unsafe URL, fall back to safe default
      redirectTo = normalizedNextUrl ? `/${normalizedNextUrl}` : '/onboarding';
    }
  } else {
    // Use nextUrl or fall back to default
    redirectTo = normalizedNextUrl ? `/${normalizedNextUrl}` : '/onboarding';
  }

  // Redirect to the determined URL
  return NextResponse.redirect(
    redirectTo.startsWith('http')
      ? redirectTo
      : new URL(redirectTo, requestUrl.origin)
  );
}
