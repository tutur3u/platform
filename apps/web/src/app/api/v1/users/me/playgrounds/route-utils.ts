import { AccountServiceError } from '@tuturuuu/utils/account-benefits-server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
export const playgroundAuth = {
  allowAppSessionAuth: { targetApp: ['learn', 'meet'] as const },
  maxPayloadSize: 3 * 1024 * 1024,
};
export const noStore = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
export async function playgroundResponse(action: () => Promise<unknown>) {
  try {
    return NextResponse.json(await action(), { headers: noStore });
  } catch (error) {
    return NextResponse.json(
      { error: 'Playground request failed' },
      {
        status:
          error instanceof AccountServiceError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 500,
        headers: noStore,
      }
    );
  }
}
export async function playgroundBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new AccountServiceError(400);
  }
}
export function playgroundId(value: string) {
  const parsed = z.guid().safeParse(value);
  if (!parsed.success) throw new AccountServiceError(400);
  return parsed.data;
}
