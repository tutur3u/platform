import {
  MAX_CODE_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LONG_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { passwordLogin, toPasswordLoginErrorResult } from '@/lib/auth/password';
import { jsonWithCors, optionsWithCors } from '../shared';

const LegacyPasswordLoginSchema = z.object({
  captchaToken: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  deviceId: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  email: z.string().email().max(MAX_EMAIL_LENGTH),
  locale: z.string().max(MAX_CODE_LENGTH).optional(),
  password: z.string().max(MAX_LONG_TEXT_LENGTH).min(6),
});

export async function OPTIONS() {
  return optionsWithCors();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = LegacyPasswordLoginSchema.safeParse(body);

    if (!parsed.success) {
      return jsonWithCors({ error: 'Invalid request body' }, { status: 400 });
    }

    const result = await passwordLogin(
      {
        ...parsed.data,
        client: 'mobile',
      },
      {
        client: 'mobile',
        endpoint: '/api/v1/auth/mobile/password-login',
        headers: request.headers,
        request,
      }
    );

    return jsonWithCors(result.body, { status: result.status });
  } catch (error) {
    const result = toPasswordLoginErrorResult(error);
    return jsonWithCors(result.body, { status: result.status });
  }
}
