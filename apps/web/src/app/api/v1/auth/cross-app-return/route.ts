import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import { getMountedAppVerifyTokenMatch } from '@tuturuuu/utils/internal-app-mounts';
import {
  type AppDomain,
  getAppDomainByUrl,
} from '@tuturuuu/utils/internal-domains';
import { mfaProofFromVerifiedClaims } from '@tuturuuu/utils/required-mfa-policy';
import { checkRequiredAccountMfa } from '@tuturuuu/utils/required-mfa-request';
import { createMfaTransfer } from '@tuturuuu/utils/required-mfa-transfer';
import { sessionAssuranceFromVerifiedClaims } from '@tuturuuu/utils/session-assurance';
import { createSessionAssuranceTransfer } from '@tuturuuu/utils/session-assurance-transfer';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getExternalAppByReturnUrl } from '@/lib/app-coordination/external-apps';
import {
  matchesRegisteredCallbackPath,
  parseCrossAppPkceChallenge,
} from '@/lib/auth/cross-app-pkce';
import {
  type ReportHandoffFailure,
  withAuthHandoffDiagnostics,
} from '@/lib/auth/handoff-diagnostics';
import { normalizeManagedTuturuuuReturnUrl } from '@/lib/auth/managed-tuturuuu-return-url';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const returnUrlSchema = z.object({
  codeChallenge: z.string().max(128).optional(),
  codeChallengeMethod: z.string().max(16).optional(),
  /** The account the user confirmed; a different session never mints. */
  expectedUserId: z.string().max(64).optional(),
  generateToken: z.boolean().optional().default(true),
  returnUrl: z.string().min(1).max(MAX_URL_LENGTH),
});

const ROUTE = '/api/v1/auth/cross-app-return';

function decodeReturnUrl(returnUrl: string) {
  // Decode only an encoded outer URL. Decoding a parsed URL also decodes
  // separators inside its nextUrl parameter.
  if (!/^https?%3a/i.test(returnUrl)) return returnUrl;
  try {
    return decodeURIComponent(returnUrl);
  } catch {
    return returnUrl;
  }
}

type ResolvedCrossAppTarget = {
  appName: string;
  canonicalReturnUrl: string;
  kind: AppDomain['kind'] | 'managed-tuturuuu';
  /** Registry apps only: handoffs must be bound to an S256 challenge. */
  requirePkce?: boolean;
  requiresToken: boolean;
  targetApp: string;
};

/**
 * `https://tuturuuu.com/<base><nextPath>` without a trailing slash: the app
 * root is `https://tuturuuu.com/<base>`, never `…/<base>/`.
 */
function mountedAppReturnUrl(
  origin: string,
  basePath: string,
  nextPath: string
) {
  const rest =
    nextPath === '/' || nextPath.startsWith('/?') || nextPath.startsWith('/#')
      ? nextPath.slice(1)
      : nextPath;
  return `${origin}${basePath}${rest}`;
}

function mapConfiguredUrlToApp(
  returnUrl: string
): ResolvedCrossAppTarget | null {
  const mounted = getMountedAppVerifyTokenMatch(returnUrl);

  if (mounted) {
    const nextPath = normalizeAuthRedirectPath(
      mounted.nextUrl,
      mounted.origin,
      '/'
    );
    // Same origin: the shared root session already authenticates the
    // mounted app, so it is returned to directly, with no handoff token.
    return {
      appName: mounted.name,
      canonicalReturnUrl: mountedAppReturnUrl(
        mounted.origin,
        mounted.basePath,
        nextPath
      ),
      kind: 'internal',
      requiresToken: false,
      targetApp: mounted.name,
    };
  }

  try {
    const appDomain = getAppDomainByUrl(returnUrl);

    return appDomain
      ? {
          appName: appDomain.name,
          canonicalReturnUrl: appDomain.canonicalUrl,
          kind: appDomain.kind,
          requiresToken: true,
          targetApp: appDomain.name,
        }
      : null;
  } catch {
    return null;
  }
}

async function resolveTargetApp(
  returnUrl: string,
  request: NextRequest
): Promise<ResolvedCrossAppTarget | null> {
  const configuredTarget = mapConfiguredUrlToApp(returnUrl);

  if (configuredTarget) {
    return configuredTarget;
  }

  const managedReturnUrl = normalizeManagedTuturuuuReturnUrl(returnUrl, {
    currentHost: request,
  });

  if (managedReturnUrl) {
    return {
      appName: new URL(managedReturnUrl).hostname,
      canonicalReturnUrl: managedReturnUrl,
      kind: 'managed-tuturuuu',
      requiresToken: false,
      targetApp: 'managed-tuturuuu',
    };
  }

  const externalApp = await getExternalAppByReturnUrl(returnUrl);

  if (
    !externalApp ||
    !matchesRegisteredCallbackPath(returnUrl, externalApp.callbackPaths ?? [])
  ) {
    return null;
  }

  return {
    appName: externalApp.displayName,
    canonicalReturnUrl: returnUrl,
    kind: 'external',
    requirePkce: externalApp.requirePkce === true,
    requiresToken: true,
    targetApp: externalApp.id,
  };
}

function buildTokenReturnUrl(target: ResolvedCrossAppTarget) {
  const nextUrl = new URL(target.canonicalReturnUrl);

  if (target.kind === 'internal') {
    const normalizedTargetPath = normalizeAuthRedirectPath(
      `${nextUrl.pathname}${nextUrl.search}`,
      nextUrl.origin,
      '/'
    );
    const verifyUrl = new URL('/verify-token', nextUrl.origin);
    verifyUrl.searchParams.set('nextUrl', normalizedTargetPath);

    return verifyUrl;
  }

  return nextUrl;
}

async function createCrossAppReturn(
  request: NextRequest,
  fail: ReportHandoffFailure
) {
  const body = await request.json().catch(() => null);
  const parsed = returnUrlSchema.safeParse(body);

  if (!parsed.success) {
    return fail(
      'INVALID_RETURN_URL',
      NextResponse.json({ error: 'Invalid returnUrl' }, { status: 400 })
    );
  }

  const decodedReturnUrl = decodeReturnUrl(parsed.data.returnUrl);
  const target = await resolveTargetApp(decodedReturnUrl, request);

  if (!target) {
    return fail(
      'INVALID_RETURN_URL',
      NextResponse.json({ error: 'Invalid returnUrl' }, { status: 400 })
    );
  }

  const pkceChallenge = parseCrossAppPkceChallenge(parsed.data);

  if (pkceChallenge === false) {
    return fail(
      'INVALID_CODE_CHALLENGE',
      NextResponse.json(
        { code: 'INVALID_CODE_CHALLENGE', error: 'Invalid code challenge' },
        { status: 400 }
      )
    );
  }

  if (!parsed.data.generateToken) {
    return NextResponse.json({
      appName: target.appName,
      targetApp: target.targetApp,
    });
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return fail(
      'UNAUTHORIZED',
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
  }

  if (parsed.data.expectedUserId && parsed.data.expectedUserId !== user.id) {
    return fail(
      'ACCOUNT_CHANGED',
      NextResponse.json({ code: 'ACCOUNT_CHANGED' }, { status: 409 })
    );
  }

  if (!target.requiresToken) {
    return NextResponse.json({
      appName: target.appName,
      returnUrl: target.canonicalReturnUrl,
      targetApp: target.targetApp,
    });
  }

  // Only registry apps redeem through the verifier-aware exchange; internal
  // verifiers would refuse a challenge-bound token, so they never get one.
  const boundChallenge = target.kind === 'external' ? pkceChallenge : null;

  if (target.requirePkce && !boundChallenge) {
    return fail(
      'PKCE_REQUIRED',
      NextResponse.json(
        { code: 'PKCE_REQUIRED', error: 'An S256 code challenge is required' },
        { status: 400 }
      )
    );
  }

  const assurance = await checkRequiredAccountMfa(
    request,
    {
      createUserClient: async () => supabase,
      createAdminClient: async () =>
        (await createAdminClient({ noCookie: true })) as TypedSupabaseClient,
      nowSeconds: () => Math.floor(Date.now() / 1000),
    },
    { userId: user.id }
  );
  if (assurance.status !== 'allowed') {
    const code =
      assurance.status === 'required' ? 'MFA_REQUIRED' : 'AUTH_UNAVAILABLE';
    return fail(
      code,
      NextResponse.json(
        { code },
        { status: assurance.status === 'required' ? 403 : 503 }
      )
    );
  }
  const verifiedClaims = await supabase.auth.getClaims();
  const sessionClaims =
    verifiedClaims.data?.claims?.sub === user.id && !verifiedClaims.error
      ? verifiedClaims.data.claims
      : null;
  const proof =
    assurance.proof ??
    (sessionClaims ? mfaProofFromVerifiedClaims(sessionClaims) : null);
  const mfaTransfer = createMfaTransfer(user.id, target.targetApp, proof);
  // The handed-off session's own aal/amr, signed so exchange can trust it.
  const assuranceTransfer = createSessionAssuranceTransfer(
    user.id,
    target.targetApp,
    sessionAssuranceFromVerifiedClaims(sessionClaims)
  );
  const mintArgs = {
    p_expiry_seconds: 300,
    p_origin_app: 'web',
    p_session_data: {
      ...(assuranceTransfer ? { assuranceTransfer } : {}),
      email: user.email ?? null,
      ...(mfaTransfer ? { mfaTransfer } : {}),
    },
    p_target_app: target.targetApp,
    p_user_id: user.id,
  };
  const { data, error } = boundChallenge
    ? await supabase.rpc('generate_cross_app_token_pkce', {
        ...mintArgs,
        p_code_challenge: boundChallenge.codeChallenge,
        p_code_challenge_method: boundChallenge.codeChallengeMethod,
      })
    : await supabase.rpc('generate_cross_app_token', mintArgs);

  if (error || !data) {
    return fail(
      'TOKEN_MINT_FAILED',
      NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
    );
  }

  const nextUrl = buildTokenReturnUrl(target);
  nextUrl.searchParams.set('token', data as string);
  nextUrl.searchParams.set('originApp', 'web');
  nextUrl.searchParams.set('targetApp', target.targetApp);

  return NextResponse.json({
    appName: target.appName,
    returnUrl: nextUrl.toString(),
    targetApp: target.targetApp,
  });
}

export async function POST(request: NextRequest) {
  return withRequestLogDrain({ request, route: ROUTE }, () =>
    withAuthHandoffDiagnostics(ROUTE, (fail) =>
      createCrossAppReturn(request, fail)
    )
  );
}
