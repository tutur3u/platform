import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getPublicOtpSettings } from '@/lib/auth/otp';
import { jsonWithCors, optionsWithCors } from '../../mobile/shared';

const QuerySchema = z
  .object({
    client: z.enum(['web', 'mobile']),
    platform: z.enum(['ios', 'android']).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.client === 'mobile' && !value.platform) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Mobile OTP settings requests must include a platform',
        path: ['platform'],
      });
    }
  });

export async function OPTIONS() {
  return optionsWithCors();
}

export async function GET(request: NextRequest) {
  const rawPlatform = request.nextUrl.searchParams.get('platform');
  const query = QuerySchema.safeParse({
    client: request.nextUrl.searchParams.get('client'),
    platform: rawPlatform && rawPlatform.length > 0 ? rawPlatform : undefined,
  });

  if (!query.success) {
    return jsonWithCors(
      {
        error: query.error.issues[0]?.message ?? 'Invalid request parameters',
      },
      { status: 400 }
    );
  }

  try {
    const result = await getPublicOtpSettings(query.data);
    return jsonWithCors(result);
  } catch (error) {
    console.error('Failed to load OTP settings:', error);
    return jsonWithCors(
      { error: 'Failed to load OTP settings' },
      { status: 500 }
    );
  }
}
