import { unstable_rethrow } from 'next/navigation';
import { type NextRequest, NextResponse } from 'next/server';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import { removeWebAccount } from '@/lib/auth/multi-account/vault';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;

  try {
    return NextResponse.json(await removeWebAccount(request, accountId));
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

    return NextResponse.json(
      { diagnosticCode, error: 'Failed to remove account' },
      { status: 500 }
    );
  }
}
