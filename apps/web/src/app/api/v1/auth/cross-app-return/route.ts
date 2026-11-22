import { requiresWorkerRedeemProof } from '@tuturuuu/auth/app-redeem-proof';
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
import { isFreshMfaProof, parseMfaMaxAge } from '@/lib/auth/mfa-proof-age';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const returnUrlSchema = z.object({
  codeChallenge: z.string().max(128).optional(),
  codeChallengeMethod: z.string().max(16).optional(),
  /** The account the user confirmed; a different session never mints. */
  expectedUserId: z.string().max(64).optional(),
  generateToken: z.boolean().optional().default(true),
  /**
   * Seconds: the minted session must carry a second-factor proof no older
   * than this. It only adds a requirement, and only a first-party app may
   * ask; its range is checked below.
   */
  mfaMaxAge: z.unknown().optional(),
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
  fail: ReportHandoffFailure,
  body: unknown
) {
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

  const mfaMaxAge = parseMfaMaxAge(parsed.data.mfaMaxAge);

  if (mfaMaxAge === false) {
    return fail(
      'INVALID_MFA_MAX_AGE',
      NextResponse.json(
        { code: 'INVALID_MFA_MAX_AGE', error: 'Invalid mfaMaxAge' },
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
  // Worker-only targets bind their handoff to the browser that started the
  // sign-in as well: the Worker redeems it with that browser's verifier, so a
  // handoff URL copied from history or logs cannot mint a session elsewhere.
  const workerOnly = requiresWorkerRedeemProof(target.targetApp);
  const boundChallenge =
    target.kind === 'external' || workerOnly ? pkceChallenge : null;

  if ((target.requirePkce || workerOnly) && !boundChallenge) {
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
  // A first-party app that needs a recent second factor gets no token for an
  // older proof. The account policy above has already passed and is not
  // relaxed; the proof judged here is the one the token carries. Another
  // registered app cannot make the user verify again on demand, so its
  // request is minted as if it had not asked.
  if (
    mfaMaxAge !== undefined &&
    target.kind === 'internal' &&
    !isFreshMfaProof(proof, mfaMaxAge)
  ) {
    return fail(
      'MFA_REQUIRED',
      NextResponse.json({ code: 'MFA_REQUIRED' }, { status: 403 })
    );
  }
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
    withAuthHandoffDiagnostics(ROUTE, async (fail) =>
      createCrossAppReturn(
        request,
        fail,
        await request.json().catch(() => null)
      )
    )
  );
}

/** Sign-in parameters that need the login page's own interaction. */
const INTERACTIVE_LOGIN_PARAMS = [
  'confirmAccount',
  'expectedUserId',
  'multiAccount',
] as const;

function redirectTo(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: {
      'Cache-Control': 'no-store',
      Location: location,
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/**
 * Signed-in continue for a registered first-party app: the satellite sends
 * the browser here instead of to `/login`. When the Tuturuuu session already
 * satisfies everything the login page would check, the handoff is minted
 * server-side and the browser goes straight back to the app's
 * `/verify-token`, so no sign-in page renders. Anything else, including no
 * session, a second-factor step-up, an account choice or a non-first-party
 * return, falls back to `/login` with the same parameters. Only a top-level
 * navigation continues, the same request the login page itself would turn
 * into a handoff.
 */
async function continueSignedInReturn(
  request: NextRequest,
  fail: ReportHandoffFailure
) {
  const params = request.nextUrl.searchParams;
  const login = new URL('/login', request.nextUrl.origin);
  login.search = request.nextUrl.search;
  const fallback = () => redirectTo(login.toString());

  const navigation =
    request.headers.get('sec-fetch-mode') === 'navigate' &&
    request.headers.get('sec-fetch-dest') === 'document';
  const returnUrl = params.get('returnUrl');
  if (
    !navigation ||
    !returnUrl ||
    INTERACTIVE_LOGIN_PARAMS.some((name) => params.has(name))
  ) {
    return fallback();
  }
  const target = await resolveTargetApp(decodeReturnUrl(returnUrl), request);
  // Only Worker-only targets continue here: their handoff is bound to the
  // browser's PKCE verifier and redeemable only with the Worker's proof, so
  // a token in this Location is useless anywhere else, including a
  // development origin in the registry. Web's own returns and every other
  // app keep the sign-in page.
  if (
    target?.kind !== 'internal' ||
    !target.requiresToken ||
    !requiresWorkerRedeemProof(target.targetApp)
  )
    return fallback();

  const rawMfaMaxAge = params.get('mfaMaxAge');
  const response = await createCrossAppReturn(request, fail, {
    codeChallenge: params.get('code_challenge') ?? undefined,
    codeChallengeMethod: params.get('code_challenge_method') ?? undefined,
    ...(rawMfaMaxAge === null ? {} : { mfaMaxAge: Number(rawMfaMaxAge) }),
    returnUrl,
  });
  if (!response.ok) return fallback();
  const body = (await response.json().catch(() => null)) as {
    returnUrl?: unknown;
  } | null;
  return typeof body?.returnUrl === 'string'
    ? redirectTo(body.returnUrl)
    : fallback();
}

export async function GET(request: NextRequest) {
  return withRequestLogDrain({ request, route: ROUTE }, () =>
    withAuthHandoffDiagnostics(ROUTE, (fail) =>
      continueSignedInReturn(request, fail)
    )
  );
}
