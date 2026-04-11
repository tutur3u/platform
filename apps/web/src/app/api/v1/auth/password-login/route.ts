import type { NextRequest } from 'next/server';
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

    return jsonWithCors(result.body, { status: result.status });
  } catch (error) {
    const result = toPasswordLoginErrorResult(error);
    return jsonWithCors(result.body, { status: result.status });
  }
}
