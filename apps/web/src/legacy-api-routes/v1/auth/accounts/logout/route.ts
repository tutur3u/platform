import { unstable_rethrow } from 'next/navigation';
import type { NextRequest } from 'next/server';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import { logoutCurrentWebAccount } from '@/lib/auth/multi-account/vault';
import { accountCorsJson, accountCorsPreflight } from '../cors';

export function OPTIONS(request: NextRequest) {
  return accountCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  try {
    return accountCorsJson(request, await logoutCurrentWebAccount(request));
  } catch (error) {
    unstable_rethrow(error);

    const diagnosticCode = createAuthDiagnosticCode('account_logout');
    logAuthDiagnostic({
      authMethod: 'multi-account',
      code: diagnosticCode,
      error,
      message: 'Failed to log out current multi-account entry',
      request,
      route: '/api/v1/auth/accounts/logout',
      stage: 'account_logout',
    });

    return accountCorsJson(
      request,
      { diagnosticCode, error: 'Failed to log out account' },
      { status: 500 }
    );
  }
}
