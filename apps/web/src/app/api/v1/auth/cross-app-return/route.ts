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
import { normalizeManagedTuturuuuReturnUrl } from '@/lib/auth/managed-tuturuuu-return-url';
import { withRequestLogDrain } from '@/lib/infrastructure/log-drain';

const returnUrlSchema = z.object({
  codeChallenge: z.string().max(128).optional(),
  codeChallengeMethod: z.string().max(16).optional(),
  generateToken: z.boolean().optional().default(true),
  returnUrl: z.string().min(1).max(MAX_URL_LENGTH),
});

function decodeReturnUrl(returnUrl: string) {
  try {
    return decodeURIComponent(returnUrl);
  } catch {
    return returnUrl;
  }
}

type ResolvedCrossAppTarget = {
  appName: string;
  /** Set for an app mounted on the apex: its verifier and app-relative next path. */
  mount?: { basePath: string; nextPath: string };
  canonicalReturnUrl: string;
  kind: AppDomain['kind'] | 'managed-tuturuuu';
  /** Registry apps only: handoffs must be bound to an S256 challenge. */
  requirePkce?: boolean;
  requiresToken: boolean;
  targetApp: string;
};

function mapConfiguredUrlToApp(
  returnUrl: string
): ResolvedCrossAppTarget | null {
  const decodedUrl = decodeReturnUrl(returnUrl);
  const mounted = getMountedAppVerifyTokenMatch(decodedUrl);

  if (mounted) {
    return {
      appName: mounted.name,
      canonicalReturnUrl: mounted.canonicalUrl,
      kind: 'internal',
      mount: {
        basePath: mounted.basePath,
        nextPath: normalizeAuthRedirectPath(
          mounted.nextUrl,
          mounted.origin,
          '/'
        ),
      },
      requiresToken: true,
      targetApp: mounted.name,
    };
  }

  try {
    const appDomain = getAppDomainByUrl(decodedUrl);

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

  const externalApp = await getExternalAppByReturnUrl(
    decodeReturnUrl(returnUrl)
  );

  if (
    !externalApp ||
    !matchesRegisteredCallbackPath(
      decodeReturnUrl(returnUrl),
      externalApp.callbackPaths ?? []
    )
  ) {
    return null;
  }

  return {
    appName: externalApp.displayName,
    canonicalReturnUrl: decodeReturnUrl(returnUrl),
    kind: 'external',
    requirePkce: externalApp.requirePkce === true,
    requiresToken: true,
    targetApp: externalApp.id,
  };
}

function buildTokenReturnUrl(target: ResolvedCrossAppTarget) {
  const nextUrl = new URL(target.canonicalReturnUrl);

  if (target.mount) {
    const verifyUrl = new URL(
      `${target.mount.basePath}/verify-token`,
      nextUrl.origin
    );
    verifyUrl.searchParams.set('nextUrl', target.mount.nextPath);

    return verifyUrl;
  }

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

async function createCrossAppReturn(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = returnUrlSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid returnUrl' }, { status: 400 });
  }

  const decodedReturnUrl = decodeReturnUrl(parsed.data.returnUrl);
  const target = await resolveTargetApp(decodedReturnUrl, request);

  if (!target) {
    return NextResponse.json({ error: 'Invalid returnUrl' }, { status: 400 });
  }

  const pkceChallenge = parseCrossAppPkceChallenge(parsed.data);

  if (pkceChallenge === false) {
    return NextResponse.json(
      { code: 'INVALID_CODE_CHALLENGE', error: 'Invalid code challenge' },
      { status: 400 }
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
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    return NextResponse.json(
      { code: 'PKCE_REQUIRED', error: 'An S256 code challenge is required' },
      { status: 400 }
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
  if (assurance.status !== 'allowed')
    return NextResponse.json(
      {
        code:
          assurance.status === 'required' ? 'MFA_REQUIRED' : 'AUTH_UNAVAILABLE',
      },
      { status: assurance.status === 'required' ? 403 : 503 }
    );
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
    console.warn('Failed to generate cross-app return token', {
      error: error?.message,
      targetApp: target.targetApp,
    });

    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
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
  return withRequestLogDrain(
    {
      request,
      route: '/api/v1/auth/cross-app-return',
    },
    () => createCrossAppReturn(request)
  );
}
