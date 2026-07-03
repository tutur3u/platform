import { MAX_LONG_TEXT_LENGTH } from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import {
  AUTH_RECOVERY_GENERIC_ERROR,
  consumeAuthRecoveryCredential,
  setAuthRecoverySessionCookies,
} from '@/lib/auth/recovery';
import { jsonWithCors, optionsWithCors } from '../../mobile/shared';

const AuthRecoveryConsumeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/u),
  email: z.string().trim().email().max(320),
  next: z.string().trim().max(MAX_LONG_TEXT_LENGTH).nullable().optional(),
});

export async function OPTIONS() {
  return optionsWithCors();
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = AuthRecoveryConsumeSchema.safeParse(body);

  if (!parsed.success) {
    return jsonWithCors(
      {
        diagnosticCode: createAuthDiagnosticCode('auth_recovery'),
        error: AUTH_RECOVERY_GENERIC_ERROR,
      },
      { status: 400 }
    );
  }

  try {
    const result = await consumeAuthRecoveryCredential({
      code: parsed.data.code,
      email: parsed.data.email,
      next: parsed.data.next,
      request,
    });

    await setAuthRecoverySessionCookies(request, result.session);

    return jsonWithCors({
      email: result.email,
      redirectTo: result.redirectTo,
      success: true,
    });
  } catch (error) {
    const diagnosticCode = createAuthDiagnosticCode('auth_recovery');
    logAuthDiagnostic({
      authMethod: 'recovery',
      code: diagnosticCode,
      error,
      message: 'Auth recovery code consume failed',
      request,
      route: '/api/v1/auth/recovery/consume',
      stage: 'auth_recovery_consume',
    });

    return jsonWithCors(
      {
        diagnosticCode,
        error: AUTH_RECOVERY_GENERIC_ERROR,
      },
      { status: 400 }
    );
  }
}
