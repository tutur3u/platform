import type { NextRequest } from 'next/server';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import {
  PasswordLoginRequestSchema,
  passwordLogin,
  toPasswordLoginErrorResult,
} from '@/lib/auth/password';
import { jsonWithCors, optionsWithCors } from '../mobile/shared';

export async function OPTIONS() {
  return optionsWithCors();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = PasswordLoginRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonWithCors({ error: 'Invalid request body' }, { status: 400 });
    }

    const result = await passwordLogin(parsed.data, {
      client: parsed.data.client,
      endpoint: '/api/v1/auth/password-login',
      headers: request.headers,
      request,
    });

    if (result.status >= 500) {
      const diagnosticCode = createAuthDiagnosticCode('password_login');
      logAuthDiagnostic({
        authMethod: 'password',
        client: parsed.data.client,
        code: diagnosticCode,
        error: result.body.error,
        message: 'Password login failed',
        request,
        route: '/api/v1/auth/password-login',
        stage: 'password_login',
        status: result.status,
      });

      return jsonWithCors(
        {
          ...result.body,
          diagnosticCode,
          error: 'Failed to login',
        },
        { status: result.status }
      );
    }

    return jsonWithCors(result.body, { status: result.status });
  } catch (error) {
    const diagnosticCode = createAuthDiagnosticCode('password_login');
    logAuthDiagnostic({
      authMethod: 'password',
      code: diagnosticCode,
      error,
      message: 'Password login route failed',
      request,
      route: '/api/v1/auth/password-login',
      stage: 'password_login',
    });
    const result = toPasswordLoginErrorResult(error);
    return jsonWithCors(
      { ...result.body, diagnosticCode },
      { status: result.status }
    );
  }
}
