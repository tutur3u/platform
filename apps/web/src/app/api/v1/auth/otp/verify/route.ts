import type { NextRequest } from 'next/server';
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

    return jsonWithCors(result.body, { status: result.status });
  } catch (error) {
    const result = toOtpErrorResult(error, 'verify');
    return jsonWithCors(result.body, { status: result.status });
  }
}
