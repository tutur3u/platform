import {
  MAX_CODE_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_OTP_LENGTH,
} from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { toOtpErrorResult, verifyOtp } from '@/lib/auth/otp';
import { jsonWithCors, optionsWithCors } from '../shared';

const LegacyVerifyOtpSchema = z.object({
  email: z.string().email().max(MAX_EMAIL_LENGTH),
  otp: z.string().max(MAX_OTP_LENGTH),
  locale: z.string().max(MAX_CODE_LENGTH).optional(),
  deviceId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  platform: z.enum(['ios', 'android']).optional(),
});

export async function OPTIONS() {
  return optionsWithCors();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = LegacyVerifyOtpSchema.safeParse(body);

    if (!parsed.success) {
      return jsonWithCors({ error: 'Invalid request body' }, { status: 400 });
    }

    const result = await verifyOtp(
      {
        ...parsed.data,
        client: 'mobile',
      },
      {
        client: 'mobile',
        endpoint: '/api/v1/auth/mobile/verify-otp',
        headers: request.headers,
        platform: parsed.data.platform,
        request,
      }
    );

    return jsonWithCors(result.body, { status: result.status });
  } catch (error) {
    const result = toOtpErrorResult(error, 'verify');
    return jsonWithCors(result.body, { status: result.status });
  }
}
