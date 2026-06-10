import type { NextRequest } from 'next/server';
import {
  createAuthDiagnosticCode,
  logAuthDiagnostic,
} from '@/lib/auth/diagnostics';
import {
  OtpSendRequestSchema,
  sendOtp,
  toOtpErrorResult,
} from '@/lib/auth/otp';
import { jsonWithCors, optionsWithCors } from '../../mobile/shared';

export async function OPTIONS() {
  return optionsWithCors();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = OtpSendRequestSchema.safeParse(body);

    if (!parsed.success) {
      return jsonWithCors({ error: 'Invalid request body' }, { status: 400 });
    }

    const result = await sendOtp(parsed.data, {
      client: parsed.data.client,
      endpoint: '/api/v1/auth/otp/send',
      headers: request.headers,
      platform: parsed.data.platform,
      request,
    });

    if (result.status >= 500) {
      const diagnosticCode = createAuthDiagnosticCode('otp_send');
      logAuthDiagnostic({
        authMethod: 'otp',
        client: parsed.data.client,
        code: diagnosticCode,
        error: result.body.error,
        message: 'OTP send failed',
        platform: parsed.data.platform,
        request,
        route: '/api/v1/auth/otp/send',
        stage: 'otp_send',
        status: result.status,
      });

      return jsonWithCors(
        { ...result.body, diagnosticCode },
        { status: result.status }
      );
    }

    return jsonWithCors(result.body, { status: result.status });
  } catch (error) {
    const diagnosticCode = createAuthDiagnosticCode('otp_send');
    logAuthDiagnostic({
      authMethod: 'otp',
      code: diagnosticCode,
      error,
      message: 'OTP send route failed',
      request,
      route: '/api/v1/auth/otp/send',
      stage: 'otp_send',
    });
    const result = toOtpErrorResult(error, 'send');
    return jsonWithCors(
      { ...result.body, diagnosticCode },
      { status: result.status }
    );
  }
}
