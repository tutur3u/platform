import { unstable_rethrow } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import { switchWebAccount } from '@/lib/auth/multi-account/vault';
import { accountCorsJson, accountCorsPreflight } from '../cors';

const switchSchema = z.object({
  accountId: z.string().min(1).max(200),
  currentRoute: z.string().max(2048).nullable().optional(),
  targetRoute: z.string().max(2048).nullable().optional(),
});

export function OPTIONS(request: NextRequest) {
  return accountCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  try {
    const parsed = switchSchema.safeParse(
      await request.json().catch(() => null)
    );

    if (!parsed.success) {
      return accountCorsJson(
        request,
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { accountId, ...payload } = parsed.data;
    const result = await switchWebAccount(request, accountId, payload);
    if (!result.success) {
      const diagnosticCode = createAuthDiagnosticCode('account_switch');
      logAuthDiagnostic({
        authMethod: 'multi-account',
        code: diagnosticCode,
        error: result.error,
        level: 'warn',
        message: 'Failed to switch multi-account vault entry',
        request,
        route: '/api/v1/auth/accounts/switch',
        stage: 'account_switch',
        status: 410,
      });

      return accountCorsJson(
        request,
        { ...result, diagnosticCode },
        { status: 410 }
      );
    }

    return accountCorsJson(request, result, {
      status: result.success ? 200 : 410,
    });
  } catch (error) {
    unstable_rethrow(error);

    const diagnosticCode = createAuthDiagnosticCode('account_switch');
    logAuthDiagnostic({
      authMethod: 'multi-account',
      code: diagnosticCode,
      error,
      message: 'Failed to switch multi-account vault entry',
      request,
      route: '/api/v1/auth/accounts/switch',
      stage: 'account_switch',
    });

    return accountCorsJson(
      request,
      { diagnosticCode, error: 'Failed to switch account' },
      { status: 500 }
    );
  }
}
