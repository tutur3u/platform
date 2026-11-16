import { unstable_rethrow } from 'next/navigation';
import type { NextRequest } from 'next/server';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import { removeWebAccount } from '@/lib/auth/multi-account/vault';
import {
  accountCorsJson,
  accountCorsPreflight,
} from '@/legacy-api-routes/v1/auth/accounts/cors';

export function OPTIONS(request: NextRequest) {
  return accountCorsPreflight(request);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  try {
    const result = await removeWebAccount(request, accountId);
    return accountCorsJson(request, result, {
      status: result.errorCode === 'switch_conflict' ? 409 : 200,
    });
  } catch (error) {
    unstable_rethrow(error);

    const diagnosticCode = createAuthDiagnosticCode('account_remove');
    logAuthDiagnostic({
      authMethod: 'multi-account',
      code: diagnosticCode,
      error,
      message: 'Failed to remove multi-account vault entry',
      request,
      route: '/api/v1/auth/accounts/[accountId]',
      stage: 'account_remove',
    });

    return accountCorsJson(
      request,
      { diagnosticCode, error: 'Failed to remove account' },
      { status: 500 }
    );
  }
}
