import { type NextRequest, NextResponse } from 'next/server';
import { vi } from 'vitest';

vi.mock('@tuturuuu/utils/required-mfa-api-session', () => ({
  guardBrowserApiSession: async (
    _request: NextRequest,
    guard: () => Promise<NextResponse | null>
  ) => (await guard()) ?? NextResponse.next(),
}));

export const AUTH_COOKIE_HEADER =
  'sb-resolved-kingfish-21146-auth-token.0=base64-validvalue';
