import type { NextRequest } from 'next/server';
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

    return jsonWithCors(result.body, { status: result.status });
  } catch (error) {
    const result = toOtpErrorResult(error, 'send');
    return jsonWithCors(result.body, { status: result.status });
  }
}
