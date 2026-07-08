import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { createClient } from '@tuturuuu/supabase/next/server';
import { MAX_NAME_LENGTH, MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import { getAppDomainByUrl } from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuthRedirectOrigin } from '@/app/[locale]/(auth)/login/auth-redirect-origin';
import { getExternalAppByReturnUrl } from '@/lib/app-coordination/external-apps';
import {
  createAuthDiagnosticCode,
  getReturnUrlKind,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import { normalizeManagedTuturuuuReturnUrl } from '@/lib/auth/managed-tuturuuu-return-url';

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
 * - Managed *.tuturuuu.com URLs for temporary internal app subdomains
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

    const internalAppDomain = getAppDomainByUrl(decodedUrl);
    const requestAppDomain = getAppDomainByUrl(requestOrigin);

    if (internalAppDomain) {
      const canonicalUrl = internalAppDomain.canonicalUrl;
      const canonicalOrigin = new URL(canonicalUrl).origin;
      const isSameOrigin = canonicalOrigin === requestOrigin;
      const isSameApp = requestAppDomain?.name === internalAppDomain.name;

      return {
        url: isSameOrigin
          ? normalizeAuthRedirectPath(canonicalUrl, requestOrigin, '/')
          : canonicalUrl,
        isExternal: !(isSameOrigin || isSameApp),
        targetApp: isSameOrigin || isSameApp ? null : internalAppDomain.name,
      };
    }

    const managedReturnUrl = normalizeManagedTuturuuuReturnUrl(decodedUrl);

    if (managedReturnUrl) {
      return {
        url: managedReturnUrl,
        isExternal: false,
        targetApp: null,
      };
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
    const targetApp = (await getExternalAppByReturnUrl(decodedUrl))?.id ?? null;
    if (targetApp) {
      return { url: decodedUrl, isExternal: true, targetApp };
    }

    // Untrusted external URL
    console.warn('[auth/callback] Untrusted returnUrl', {
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
  const redirectOrigin = resolveAuthRedirectOrigin({
    currentOrigin: requestUrl.origin,
    preserveCurrentManagedOrigin: true,
  });

  // Parse and validate query parameters
  const parseResult = queryParamsSchema.safeParse({
    code: requestUrl.searchParams.get('code'),
    returnUrl: requestUrl.searchParams.get('returnUrl'),
    nextUrl: requestUrl.searchParams.get('nextUrl'),
    multiAccount: requestUrl.searchParams.get('multiAccount'),
  });

  if (!parseResult.success) {
    console.warn('[auth/callback] Invalid query parameters', {
      error: parseResult.error.message,
    });
    return NextResponse.redirect(new URL('/onboarding', redirectOrigin));
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
      const exchangeResult = await supabase.auth.exchangeCodeForSession(_code);
      if (exchangeResult?.error) {
        throw exchangeResult.error;
      }
    } catch (error) {
      const diagnosticCode = createAuthDiagnosticCode(
        'oauth_callback_exchange'
      );
      logAuthDiagnostic({
        authMethod: 'oauth',
        code: diagnosticCode,
        error,
        level: 'warn',
        message: '[auth/callback] Failed to exchange code for session',
        request,
        returnUrlKind: getReturnUrlKind(_returnUrl, redirectOrigin),
        route: '/api/auth/callback',
        stage: 'oauth_callback_exchange',
      });
      // Return safe error response without leaking details
      const loginUrl = new URL('/login', redirectOrigin);
      loginUrl.searchParams.set('error', 'auth_failed');
      loginUrl.searchParams.set('diagnosticCode', diagnosticCode);
      return NextResponse.redirect(loginUrl);
    }
  }

  // If in multi-account mode, redirect to the add-account page
  if (multiAccount) {
    const addAccountUrl = new URL('/add-account', redirectOrigin);
    if (_returnUrl) {
      const validated = await validateRedirectUrl(_returnUrl, redirectOrigin);
      if (validated) {
        addAccountUrl.searchParams.set('returnUrl', validated.url);
      }
    }
    return NextResponse.redirect(addAccountUrl);
  }

  // Handle returnUrl with cross-app token generation for external apps
  if (_returnUrl) {
    const validated = await validateRedirectUrl(_returnUrl, redirectOrigin);

    if (validated) {
      if (validated.isExternal && validated.targetApp) {
        // External app - return to the login page first so the user confirms
        // the active platform account before a cross-app token is generated.
        const loginUrl = new URL('/login', redirectOrigin);
        loginUrl.searchParams.set('returnUrl', validated.url);
        return NextResponse.redirect(loginUrl);
      }

      // Same-origin URL - redirect directly
      const redirectUrl = validated.url.startsWith('http')
        ? new URL(validated.url)
        : new URL(validated.url, redirectOrigin);

      return NextResponse.redirect(redirectUrl);
    }

    // Invalid returnUrl - fall back to default
    console.warn('[auth/callback] Invalid returnUrl, using default');
  }

  // Use nextUrl or fall back to default
  const defaultPath = normalizedNextUrl
    ? `/${normalizedNextUrl}`
    : '/onboarding';
  const redirectUrl = new URL(defaultPath, redirectOrigin);

  return NextResponse.redirect(redirectUrl);
}
