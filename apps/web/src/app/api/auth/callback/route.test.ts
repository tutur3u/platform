import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  generateCrossAppToken: vi.fn(),
  mapUrlToApp: vi.fn(),
}));

vi.mock('@tuturuuu/auth/cross-app', async () => {
  const actual = await vi.importActual<
    typeof import('@tuturuuu/auth/cross-app')
  >('@tuturuuu/auth/cross-app');

  return {
    ...actual,
    generateCrossAppToken: (
      ...args: Parameters<typeof mocks.generateCrossAppToken>
    ) => mocks.generateCrossAppToken(...args),
    mapUrlToApp: (...args: Parameters<typeof mocks.mapUrlToApp>) =>
      mocks.mapUrlToApp(...args),
  };
});

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
    mocks.generateCrossAppToken.mockResolvedValue('cross-app-token');
    mocks.mapUrlToApp.mockReturnValue(null);
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

  it('keeps trusted external app returnUrl values intact', async () => {
    mocks.mapUrlToApp.mockReturnValue('mail');

    const externalReturnUrl = encodeURIComponent('https://mail.tuturuuu.com');
    const response = await GET(
      new NextRequest(
        `http://localhost/api/auth/callback?returnUrl=${externalReturnUrl}`
      )
    );

    expect(response.headers.get('location')).toBe(
      'https://mail.tuturuuu.com/?token=cross-app-token&originApp=platform&targetApp=mail'
    );
  });
});
