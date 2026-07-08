import { unstable_rethrow } from 'next/navigation';
import type { NextRequest } from 'next/server';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import { logoutAllWebAccounts } from '@/lib/auth/multi-account/vault';
import { accountCorsJson, accountCorsPreflight } from '../cors';

export function OPTIONS(request: NextRequest) {
  return accountCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  try {
    return accountCorsJson(request, await logoutAllWebAccounts(request));
  } catch (error) {
    unstable_rethrow(error);

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

    return accountCorsJson(
      request,
      { diagnosticCode, error: 'Failed to log out accounts' },
      { status: 500 }
    );
  }
}
