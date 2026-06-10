import { type NextRequest, NextResponse } from 'next/server';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import { logoutAllWebAccounts } from '@/lib/auth/multi-account/vault';

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await logoutAllWebAccounts(request));
  } catch (error) {
    const diagnosticCode = createAuthDiagnosticCode('account_logout_all');
    logAuthDiagnostic({
      authMethod: 'multi-account',
      code: diagnosticCode,
      error,
      message: 'Failed to log out all multi-account entries',
      request,
      route: '/api/v1/auth/accounts/logout-all',
      stage: 'account_logout_all',
    });

    return NextResponse.json(
      { diagnosticCode, error: 'Failed to log out accounts' },
      { status: 500 }
    );
  }
}
