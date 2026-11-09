import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import {
  consumeAuthRecoveryCredential,
  getAuthRecoveryLocalizedPath,
  getAuthRecoveryRequestOrigin,
  setAuthRecoverySessionCookies,
} from '@/lib/auth/recovery';

interface Params {
  params: Promise<{ locale: string }>;
}

function recoveryPageUrl(request: NextRequest, locale: string, error?: string) {
  const url = new URL(
    getAuthRecoveryLocalizedPath('/auth/recovery', locale),
    getAuthRecoveryRequestOrigin(request)
  );
  if (error) url.searchParams.set('error', error);
  return url;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { locale } = await params;
  const token = request.nextUrl.searchParams.get('token');
  const next = request.nextUrl.searchParams.get('next');

  if (!token) {
    return NextResponse.redirect(recoveryPageUrl(request, locale, 'invalid'));
  }

  try {
    const result = await consumeAuthRecoveryCredential({
      next,
      request,
      token,
    });
    await setAuthRecoverySessionCookies(request, result.session);

    return NextResponse.redirect(
      new URL(result.redirectTo, getAuthRecoveryRequestOrigin(request))
    );
  } catch (error) {
    const diagnosticCode = createAuthDiagnosticCode('auth_recovery');
    logAuthDiagnostic({
      authMethod: 'recovery',
      code: diagnosticCode,
      error,
      message: 'Auth recovery token confirm failed',
      request,
      route: `/${locale}/auth/recovery/confirm`,
      stage: 'auth_recovery_confirm',
    });

    const url = recoveryPageUrl(request, locale, 'invalid');
    url.searchParams.set('diagnostic', diagnosticCode);
    return NextResponse.redirect(url);
  }
}
