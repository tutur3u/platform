import { Buffer } from 'node:buffer';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { checkIfUserExists, validateEmail } from '@tuturuuu/utils/email/server';
import { type NextRequest, NextResponse } from 'next/server';
import { DEV_MODE } from '@/constants/common';
import {
  isLocalE2EAuthBypassEnabled,
  isLocalE2EAuthRequestAllowed,
} from '@/lib/auth/local-e2e';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { resetRateLimitMemoryStoreForTests } from '@/lib/rate-limit';

const LOCAL_E2E_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;
const SUPABASE_BASE64_PREFIX = 'base64-';

const COMPLETED_ONBOARDING_STEPS = [
  'welcome',
  'use_case',
  'profile',
  'celebration',
];

async function completeDevSessionOnboarding(
  sbAdmin: TypedSupabaseClient,
  userId: string
) {
  return sbAdmin
    .from('onboarding_progress')
    .upsert(
      {
        user_id: userId,
        completed_steps: COMPLETED_ONBOARDING_STEPS,
        current_step: 'celebration',
        profile_completed: true,
        tour_completed: false,
        completed_at: new Date().toISOString(),
        use_case: 'small_team',
        flow_type: 'team',
        invited_emails: [] as string[],
        notifications_enabled: true,
      },
      { onConflict: 'user_id' }
    )
    .select('user_id')
    .single();
}

function getSupabaseAuthStorageKeyOrNull(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

function getHeaderUrl(
  headers: NextRequest['headers'],
  headerName: string,
  protocol: string | null
) {
  const host = headers.get(headerName)?.split(',')[0]?.trim();

  if (!host || /[\r\n]/u.test(host)) {
    return null;
  }

  const normalizedProtocol =
    protocol === 'http' || protocol === 'https' ? protocol : 'https';

  return `${normalizedProtocol}://${host}`;
}

function getLocalE2ESupabaseCookieOptions(request: NextRequest) {
  const forwardedProtocol =
    request.headers
      .get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim()
      ?.replace(/:$/u, '') ?? null;
  const candidateUrls = [
    request.url,
    getHeaderUrl(request.headers, 'x-forwarded-host', forwardedProtocol),
    getHeaderUrl(request.headers, 'host', forwardedProtocol),
    process.env.PORTLESS_URL,
    process.env.BASE_URL,
  ];

  for (const requestUrl of candidateUrls) {
    if (!requestUrl) {
      continue;
    }

    try {
      const hostname = new URL(requestUrl).hostname;

      if (hostname === 'tuturuuu.com' || hostname.endsWith('.tuturuuu.com')) {
        return {
          domain: '.tuturuuu.com',
          path: '/',
          sameSite: 'lax' as const,
          secure: true,
        };
      }

      if (
        hostname === 'tuturuuu.localhost' ||
        hostname.endsWith('.tuturuuu.localhost')
      ) {
        return {
          domain: '.tuturuuu.localhost',
          path: '/',
          sameSite: 'lax' as const,
          secure: false,
        };
      }
    } catch {
      // Try the next candidate below.
    }
  }

  return {
    path: '/',
    sameSite: 'lax' as const,
    secure: false,
  };
}

function encodeSupabaseSessionCookieValue(session: unknown) {
  return `${SUPABASE_BASE64_PREFIX}${Buffer.from(
    JSON.stringify(session),
    'utf8'
  ).toString('base64url')}`;
}

function mirrorLocalE2ESupabaseBrowserCookie(
  request: NextRequest,
  response: NextResponse,
  session: unknown
) {
  if (!isLocalE2EAuthBypassEnabled()) {
    return;
  }

  const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serverSupabaseUrl =
    process.env.SUPABASE_SERVER_URL ?? publicSupabaseUrl;
  const publicStorageKey = getSupabaseAuthStorageKeyOrNull(publicSupabaseUrl);
  const serverStorageKey = getSupabaseAuthStorageKeyOrNull(serverSupabaseUrl);

  if (
    !publicStorageKey ||
    !serverStorageKey ||
    publicStorageKey === serverStorageKey
  ) {
    return;
  }

  const cookieOptions = getLocalE2ESupabaseCookieOptions(request);

  response.cookies.set(
    publicStorageKey,
    encodeSupabaseSessionCookieValue(session),
    {
      domain: cookieOptions.domain,
      httpOnly: false,
      maxAge: LOCAL_E2E_SESSION_COOKIE_MAX_AGE_SECONDS,
      path: cookieOptions.path,
      sameSite: cookieOptions.sameSite,
      secure: cookieOptions.secure,
    }
  );
}

export async function POST(request: NextRequest) {
  if (!DEV_MODE && !isLocalE2EAuthRequestAllowed(request)) {
    return NextResponse.json(
      { error: 'This endpoint is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const { completeOnboarding, email, locale, resetRateLimits } =
      await request.json();

    if (resetRateLimits === true) {
      resetRateLimitMemoryStoreForTests();
    }

    const validatedEmail = await validateEmail(email);
    const normalizedLocale =
      typeof locale === 'string' && locale.trim().length > 0
        ? locale.trim()
        : 'en';

    const metadata = {
      locale: normalizedLocale,
      origin: 'TUTURUUU',
    };
    const sbAdmin = (await createAdminClient()) as TypedSupabaseClient;
    let userId: string | null =
      (await checkIfUserExists({ email: validatedEmail })) ?? null;

    if (userId) {
      const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
        userId,
        {
          user_metadata: metadata,
        }
      );

      if (updateError) {
        serverLogger.error(
          '[auth/dev-session] Failed to update user:',
          updateError
        );
        return NextResponse.json(
          { error: 'Failed to update user' },
          { status: 500 }
        );
      }
    } else {
      const { data: createData, error: createError } =
        await sbAdmin.auth.admin.createUser({
          email: validatedEmail,
          email_confirm: true,
          user_metadata: metadata,
        });

      if (createError) {
        serverLogger.error(
          '[auth/dev-session] Failed to create user:',
          createError
        );
        return NextResponse.json(
          { error: 'Failed to create user' },
          { status: 500 }
        );
      }

      userId = createData.user?.id ?? null;
    }

    if (completeOnboarding === true) {
      if (!userId) {
        serverLogger.error(
          '[auth/dev-session] Failed to resolve user for onboarding'
        );
        return NextResponse.json(
          { error: 'Failed to complete onboarding' },
          { status: 500 }
        );
      }

      const { error: onboardingError } = await completeDevSessionOnboarding(
        sbAdmin,
        userId
      );

      if (onboardingError) {
        serverLogger.error(
          '[auth/dev-session] Failed to complete onboarding:',
          onboardingError
        );
        return NextResponse.json(
          { error: 'Failed to complete onboarding' },
          { status: 500 }
        );
      }
    }

    const { data: linkData, error: linkError } =
      await sbAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: validatedEmail,
      });

    const tokenHash = linkData?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      serverLogger.error(
        '[auth/dev-session] Failed to generate magic link:',
        linkError
      );
      return NextResponse.json(
        { error: 'Failed to generate session' },
        { status: 500 }
      );
    }

    const supabase = await createClient(request);
    const { data: verifyData, error: verifyError } =
      await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      });

    if (verifyError || !verifyData.session) {
      serverLogger.error(
        '[auth/dev-session] Failed to verify magic link:',
        verifyError
      );
      return NextResponse.json(
        { error: 'Failed to establish session' },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ success: true });
    mirrorLocalE2ESupabaseBrowserCookie(request, response, verifyData.session);

    return response;
  } catch (error) {
    serverLogger.error('[auth/dev-session] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
