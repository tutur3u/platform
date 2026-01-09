import { generateCrossAppToken, mapUrlToApp } from '@tuturuuu/auth/cross-app';
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
 * Allows:
 * - Relative paths (same origin)
 * - Same-origin absolute URLs
 * - Trusted internal app domains (for cross-app auth)
 */
function validateRedirectUrl(
  encodedUrl: string,
  requestOrigin: string
): { url: string; isExternal: boolean; targetApp: string | null } | null {
  try {
    const decodedUrl = decodeURIComponent(encodedUrl);

    // Relative paths are always safe (same origin)
    if (decodedUrl.startsWith('/')) {
      return { url: decodedUrl, isExternal: false, targetApp: null };
    }

    // Validate absolute URLs
    const url = new URL(decodedUrl);

    // Only allow http/https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    // Check if it's a same-origin URL
    if (url.origin === requestOrigin) {
      return { url: decodedUrl, isExternal: false, targetApp: null };
    }

    // Check if it's a trusted internal app domain
    const targetApp = mapUrlToApp(decodedUrl);
    if (targetApp) {
      return { url: decodedUrl, isExternal: true, targetApp };
    }

    // Untrusted external URL
    console.warn('[auth/callback] Untrusted returnUrl:', decodedUrl);
    return null;
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
    console.error(
      '[auth/callback] Invalid query parameters:',
      parseResult.error
    );
    return NextResponse.redirect(new URL('/onboarding', requestUrl.origin));
  }

  const {
    code: _code,
    returnUrl: _returnUrl,
    nextUrl: _nextUrl,
    multiAccount,
  } = parseResult.data;

  // Normalize nextUrl by removing leading slashes to avoid double slashes
  const normalizedNextUrl = _nextUrl?.replace(/^\/+/, '');

  // Create Supabase client for auth operations
  const supabase = await createClient();

  if (_code) {
    try {
      // Exchange the code for a session
      await supabase.auth.exchangeCodeForSession(_code);
    } catch (error) {
      // Log error server-side only (not in response)
      console.error(
        '[auth/callback] Failed to exchange code for session:',
        error
      );
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
      const validated = validateRedirectUrl(_returnUrl, requestUrl.origin);
      if (validated) {
        addAccountUrl.searchParams.set('returnUrl', validated.url);
      }
    }
    return NextResponse.redirect(addAccountUrl);
  }

  // Handle returnUrl with cross-app token generation for external apps
  if (_returnUrl) {
    const validated = validateRedirectUrl(_returnUrl, requestUrl.origin);

    if (validated) {
      if (validated.isExternal && validated.targetApp) {
        // External app - generate cross-app token and redirect
        const token = await generateCrossAppToken(
          supabase,
          validated.targetApp,
          'platform'
        );

        if (token) {
          const redirectUrl = new URL(validated.url);
          redirectUrl.searchParams.set('token', token);
          redirectUrl.searchParams.set('originApp', 'platform');
          redirectUrl.searchParams.set('targetApp', validated.targetApp);

          console.log(
            '[auth/callback] Cross-app redirect to:',
            validated.targetApp
          );
          return NextResponse.redirect(redirectUrl);
        }

        // Failed to generate token - redirect to login page of the external app
        // so the user can try logging in directly there
        console.error(
          '[auth/callback] Failed to generate cross-app token for:',
          validated.targetApp
        );
        return NextResponse.redirect(new URL(validated.url));
      }

      // Same-origin URL - redirect directly
      const redirectUrl = validated.url.startsWith('http')
        ? new URL(validated.url)
        : new URL(validated.url, requestUrl.origin);

      return NextResponse.redirect(redirectUrl);
    }

    // Invalid returnUrl - fall back to default
    console.warn('[auth/callback] Invalid returnUrl, using default');
  }

  // Use nextUrl or fall back to default
  const defaultPath = normalizedNextUrl
    ? `/${normalizedNextUrl}`
    : '/onboarding';
  const redirectUrl = new URL(defaultPath, requestUrl.origin);

  return NextResponse.redirect(redirectUrl);
}
