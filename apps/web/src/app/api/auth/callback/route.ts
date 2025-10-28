import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const queryParamsSchema = z.object({
  code: z.string().nullable(),
  returnUrl: z.string().nullable(),
  nextUrl: z.string().nullable(),
  multiAccount: z
    .string()
    .nullable()
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

  const { code: _code, returnUrl: _returnUrl, nextUrl: _nextUrl, multiAccount } = parseResult.data;

  // Normalize nextUrl by removing leading slashes to avoid double slashes
  const normalizedNextUrl = _nextUrl?.replace(/^\/+/, '');

  if (_code) {
    try {
      // Create and await the Supabase client
      const supabase = await createClient();
      // Exchange the code for a session
      await supabase.auth.exchangeCodeForSession(_code);
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
    if (_returnUrl) {
      // Validate returnUrl before passing it along
      // validateRedirectUrl already returns a decoded, normalized URL
      const validatedUrl = validateRedirectUrl(_returnUrl, requestUrl.origin);
      if (validatedUrl) {
        // Set the raw validated URL - searchParams.set() will handle encoding automatically
        addAccountUrl.searchParams.set('returnUrl', validatedUrl);
      }
    }
    // Pass URL object directly to NextResponse.redirect
    return NextResponse.redirect(addAccountUrl);
  }

  // Determine the redirect URL after authentication
  let redirectUrl: URL;

  if (_returnUrl) {
    const validatedUrl = validateRedirectUrl(_returnUrl, requestUrl.origin);
    if (validatedUrl) {
      // Create URL object from validated path or absolute URL
      redirectUrl = validatedUrl.startsWith('http')
        ? new URL(validatedUrl)
        : new URL(validatedUrl, requestUrl.origin);
    } else {
      // Invalid or unsafe URL, fall back to safe default
      const fallbackPath = normalizedNextUrl ? `/${normalizedNextUrl}` : '/onboarding';
      redirectUrl = new URL(fallbackPath, requestUrl.origin);
    }
  } else {
    // Use nextUrl or fall back to default
    const defaultPath = normalizedNextUrl ? `/${normalizedNextUrl}` : '/onboarding';
    redirectUrl = new URL(defaultPath, requestUrl.origin);
  }

  // Pass URL object directly to NextResponse.redirect for consistent handling
  return NextResponse.redirect(redirectUrl);
}
