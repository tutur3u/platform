import type { NextRequest } from 'next/server';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import {
  OtpVerifyRequestSchema,
  toOtpErrorResult,
  verifyOtp,
} from '@/lib/auth/otp';
import { jsonWithCors, optionsWithCors } from '../../mobile/shared';

export async function OPTIONS() {
  return optionsWithCors();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = OtpVerifyRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonWithCors({ error: 'Invalid request body' }, { status: 400 });
    }

    const result = await verifyOtp(parsed.data, {
      client: parsed.data.client,
      endpoint: '/api/v1/auth/otp/verify',
      headers: request.headers,
      platform: parsed.data.platform,
      request,
    });

    if (result.status >= 500) {
      const diagnosticCode = createAuthDiagnosticCode('otp_verify');
      logAuthDiagnostic({
        authMethod: 'otp',
        client: parsed.data.client,
        code: diagnosticCode,
        error: result.body.error,
        message: 'OTP verify failed',
        platform: parsed.data.platform,
        request,
        route: '/api/v1/auth/otp/verify',
        stage: 'otp_verify',
        status: result.status,
      });

      return jsonWithCors(
        {
          ...result.body,
          diagnosticCode,
          error: 'Verification failed. Please try again.',
        },
        { status: result.status }
      );
    }

    return jsonWithCors(result.body, { status: result.status });
  } catch (error) {
    const diagnosticCode = createAuthDiagnosticCode('otp_verify');
    logAuthDiagnostic({
      authMethod: 'otp',
      code: diagnosticCode,
      error,
      message: 'OTP verify route failed',
      request,
      route: '/api/v1/auth/otp/verify',
      stage: 'otp_verify',
    });
    const result = toOtpErrorResult(error, 'verify');
    return jsonWithCors(
      { ...result.body, diagnosticCode },
      { status: result.status }
    );
  }
}
