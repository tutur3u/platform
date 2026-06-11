import { unstable_rethrow } from 'next/navigation';
import { connection, type NextRequest, NextResponse } from 'next/server';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import { listWebAccounts } from '@/lib/auth/multi-account/vault';

export async function GET(request: NextRequest) {
  await connection();

  try {
    return NextResponse.json(await listWebAccounts(request));
  } catch (error) {
    unstable_rethrow(error);

    const diagnosticCode = createAuthDiagnosticCode('account_list');
    logAuthDiagnostic({
      authMethod: 'multi-account',
      code: diagnosticCode,
      error,
      message: 'Failed to load multi-account vault',
      request,
      route: '/api/v1/auth/accounts',
      stage: 'account_list',
    });

    return NextResponse.json(
      {
        accounts: [],
        activeAccountId: null,
        diagnosticCode,
        error: 'Failed to load accounts',
      },
      { status: 500 }
    );
  }
}
