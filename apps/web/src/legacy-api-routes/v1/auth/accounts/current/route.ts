import { unstable_rethrow } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAuthDiagnosticCode,
  getReturnUrlKind,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import {
  saveCurrentWebAccount,
  updateCurrentWebAccount,
} from '@/lib/auth/multi-account/vault';
import { accountCorsJson, accountCorsPreflight } from '../cors';

const saveSchema = z.object({
  returnUrl: z.string().max(2048).nullable().optional(),
  route: z.string().max(2048).nullable().optional(),
});

const updateSchema = z.object({
  route: z.string().max(2048).nullable().optional(),
  workspaceId: z.string().max(200).nullable().optional(),
});

export function OPTIONS(request: NextRequest) {
  return accountCorsPreflight(request);
}

export async function POST(request: NextRequest) {
  try {
    const parsed = saveSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      return accountCorsJson(
        request,
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const result = await saveCurrentWebAccount(request, parsed.data);
    if (!result.success) {
      const diagnosticCode = createAuthDiagnosticCode('account_save');
      logAuthDiagnostic({
        authMethod: 'multi-account',
        code: diagnosticCode,
        error: result.error,
        level: 'warn',
        message: 'Failed to save current multi-account vault entry',
        request,
        returnUrlKind: getReturnUrlKind(
          parsed.data.returnUrl,
          request.nextUrl.origin
        ),
        route: '/api/v1/auth/accounts/current',
        stage: 'account_save',
        status: 401,
      });

      return accountCorsJson(
        request,
        { ...result, diagnosticCode },
        { status: 401 }
      );
    }

    return accountCorsJson(request, result, {
      status: result.success ? 200 : 401,
    });
  } catch (error) {
    unstable_rethrow(error);

    const diagnosticCode = createAuthDiagnosticCode('account_save');
    logAuthDiagnostic({
      authMethod: 'multi-account',
      code: diagnosticCode,
      error,
      message: 'Failed to save current multi-account vault entry',
      request,
      route: '/api/v1/auth/accounts/current',
      stage: 'account_save',
    });

    return accountCorsJson(
      request,
      { diagnosticCode, error: 'Failed to save current account' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const parsed = updateSchema.safeParse(
      await request.json().catch(() => ({}))
    );

    if (!parsed.success) {
      return accountCorsJson(
        request,
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    return accountCorsJson(
      request,
      await updateCurrentWebAccount(request, parsed.data)
    );
  } catch (error) {
    unstable_rethrow(error);

    const diagnosticCode = createAuthDiagnosticCode('account_update');
    logAuthDiagnostic({
      authMethod: 'multi-account',
      code: diagnosticCode,
      error,
      message: 'Failed to update multi-account context',
      request,
      route: '/api/v1/auth/accounts/current',
      stage: 'account_update',
    });

    return accountCorsJson(
      request,
      { diagnosticCode, error: 'Failed to update account context' },
      { status: 500 }
    );
  }
}
