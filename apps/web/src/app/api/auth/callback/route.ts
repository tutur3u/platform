import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { createClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH, MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import { getAppDomainMap } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getExternalAppByReturnUrl } from '@/lib/app-coordination/external-apps';
import { serverLogger } from '@/lib/infrastructure/log-drain';

const queryParamsSchema = z.object({
  code: z.string().max(MAX_NAME_LENGTH).nullable(),
  returnUrl: z.string().max(MAX_URL_LENGTH).nullable(),
  nextUrl: z.string().max(MAX_URL_LENGTH).nullable(),
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
 * - Trusted internal app domains and registered external app origins
 */
async function validateRedirectUrl(
  encodedUrl: string,
  requestOrigin: string
): Promise<{
  url: string;
  isExternal: boolean;
  targetApp: string | null;
} | null> {
  try {
    const decodedUrl = decodeURIComponent(encodedUrl);

    // Relative paths are always safe (same origin)
    if (decodedUrl.startsWith('/')) {
      return {
        url: normalizeAuthRedirectPath(decodedUrl, requestOrigin, '/'),
        isExternal: false,
        targetApp: null,
      };
    }

    // Validate absolute URLs
    const url = new URL(decodedUrl);

    // Only allow http/https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    // Check if it's a same-origin URL
    if (url.origin === requestOrigin) {
      return {
        url: normalizeAuthRedirectPath(decodedUrl, requestOrigin, '/'),
        isExternal: false,
        targetApp: null,
      };
    }

    // Check if it's a trusted internal app domain or registered external app.
    const targetApp =
      getAppDomainMap().find(
        (domain) => new URL(domain.url).origin === url.origin
      )?.name ??
      (await getExternalAppByReturnUrl(decodedUrl))?.id ??
      null;
    if (targetApp) {
      return { url: decodedUrl, isExternal: true, targetApp };
    }

    // Untrusted external URL
    serverLogger.warn('[auth/callback] Untrusted returnUrl', {
      returnUrl: decodedUrl,
    });
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
    serverLogger.warn('[auth/callback] Invalid query parameters', {
      error: parseResult.error.message,
    });
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
      serverLogger.warn('[auth/callback] Failed to exchange code for session', {
        error: error instanceof Error ? error.message : String(error),
      });
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
      const validated = await validateRedirectUrl(
        _returnUrl,
        requestUrl.origin
      );
      if (validated) {
        addAccountUrl.searchParams.set('returnUrl', validated.url);
      }
    }
    return NextResponse.redirect(addAccountUrl);
  }

  // Handle returnUrl with cross-app token generation for external apps
  if (_returnUrl) {
    const validated = await validateRedirectUrl(_returnUrl, requestUrl.origin);

    if (validated) {
      if (validated.isExternal && validated.targetApp) {
        // External app - return to the login page first so the user confirms
        // the active platform account before a cross-app token is generated.
        const loginUrl = new URL('/login', requestUrl.origin);
        loginUrl.searchParams.set('returnUrl', validated.url);
        return NextResponse.redirect(loginUrl);
      }

      // Same-origin URL - redirect directly
      const redirectUrl = validated.url.startsWith('http')
        ? new URL(validated.url)
        : new URL(validated.url, requestUrl.origin);

      return NextResponse.redirect(redirectUrl);
    }

    // Invalid returnUrl - fall back to default
    serverLogger.warn('[auth/callback] Invalid returnUrl, using default');
  }

  // Use nextUrl or fall back to default
  const defaultPath = normalizedNextUrl
    ? `/${normalizedNextUrl}`
    : '/onboarding';
  const redirectUrl = new URL(defaultPath, requestUrl.origin);

  return NextResponse.redirect(redirectUrl);
}
