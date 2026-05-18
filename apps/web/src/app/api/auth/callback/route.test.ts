import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

describe('auth callback route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('flattens same-origin nested returnUrl redirects', async () => {
    const nestedReturnUrl = encodeURIComponent(
      'http://localhost/login?returnUrl=%2Fworkspace%2Fdemo%3Ftab%3Dmail'
    );
    const response = await GET(
      new NextRequest(
        `http://localhost/api/auth/callback?returnUrl=${nestedReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost/workspace/demo?tab=mail'
    );
  });

  it('routes trusted external app returnUrl values through login confirmation', async () => {
    const externalReturnUrl = encodeURIComponent('https://cms.tuturuuu.com');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/auth/callback?returnUrl=${externalReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'http://localhost/login?returnUrl=https%3A%2F%2Fcms.tuturuuu.com'
    );
  });

  it('allows the root platform returnUrl when supplied over http and redirects to https', async () => {
    const returnUrl = encodeURIComponent('http://tuturuuu.com/mail?tab=inbox');
    const response = await GET(
      new NextRequest(
        `http://tuturuuu.com/api/auth/callback?returnUrl=${returnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/mail?tab=inbox'
    );
  });
});
