import { normalizeAuthRedirectPath } from '@tuturuuu/auth/proxy';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MAX_URL_LENGTH } from '@tuturuuu/utils/constants';
import {
  type AppDomain,
  getAppDomainByUrl,
} from '@tuturuuu/utils/internal-domains';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getExternalAppByReturnUrl } from '@/lib/app-coordination/external-apps';
import {
  serverLogger,
  withRequestLogDrain,
} from '@/lib/infrastructure/log-drain';

const returnUrlSchema = z.object({
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
  canonicalReturnUrl: string;
  kind: AppDomain['kind'];
  targetApp: string;
};

function mapConfiguredUrlToApp(returnUrl: string) {
  const decodedUrl = decodeReturnUrl(returnUrl);

  try {
    const appDomain = getAppDomainByUrl(decodedUrl);

    return appDomain
      ? {
          appName: appDomain.name,
          canonicalReturnUrl: appDomain.canonicalUrl,
          kind: appDomain.kind,
          targetApp: appDomain.name,
        }
      : null;
  } catch {
    return null;
  }
}

async function resolveTargetApp(
  returnUrl: string
): Promise<ResolvedCrossAppTarget | null> {
  const configuredTarget = mapConfiguredUrlToApp(returnUrl);

  if (configuredTarget) {
    return configuredTarget;
  }

  const externalApp = await getExternalAppByReturnUrl(
    decodeReturnUrl(returnUrl)
  );

  return externalApp
    ? {
        appName: externalApp.displayName,
        canonicalReturnUrl: decodeReturnUrl(returnUrl),
        kind: 'external',
        targetApp: externalApp.id,
      }
    : null;
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

async function createCrossAppReturn(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = returnUrlSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid returnUrl' }, { status: 400 });
  }

  const decodedReturnUrl = decodeReturnUrl(parsed.data.returnUrl);
  const target = await resolveTargetApp(decodedReturnUrl);

  if (!target) {
    return NextResponse.json({ error: 'Invalid returnUrl' }, { status: 400 });
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

  const { data, error } = await supabase.rpc('generate_cross_app_token', {
    p_expiry_seconds: 300,
    p_origin_app: 'web',
    p_session_data: user.email ? { email: user.email } : null,
    p_target_app: target.targetApp,
    p_user_id: user.id,
  });

  if (error || !data) {
    serverLogger.warn('Failed to generate cross-app return token', {
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
