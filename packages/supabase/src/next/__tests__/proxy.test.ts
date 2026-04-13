import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSession } from '../proxy';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }),
    },
  })),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn().mockReturnValue({
      headers: {
        get: () => null,
        set: () => {},
        entries: () => [],
        [Symbol.iterator]: function* () {},
      },
      cookies: {
        get: () => null,
        set: () => {},
        getAll: () => [],
      },
    }),
  },
}));

vi.mock('../common', () => ({
  checkEnvVariables: () => ({
    url: 'https://test.supabase.co',
    key: 'test-key',
  }),
}));

describe('Supabase Proxy', () => {
  const mockRequest = {
    headers: new Map(),
    cookies: {
      getAll: () => [],
      set: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a response with the request', async () => {
    await updateSession(mockRequest as any);
    expect(NextResponse.next).toHaveBeenCalledWith({
      request: mockRequest,
    });
  });

  it('should check for user session', async () => {
    await updateSession(mockRequest as any);
    expect(createServerClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-key',
      expect.any(Object)
    );
  });

  it('should handle cookies correctly', async () => {
    const mockCookies = [
      { name: 'test-cookie', value: 'test-value', options: {} },
    ];

    // Mock a client that sets cookies
    (createServerClient as any).mockImplementationOnce(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        getClaims: vi.fn().mockResolvedValue({ data: { claims: null } }),
      },
      cookies: mockCookies,
    }));

    await updateSession(mockRequest as any);

    // Verify cookie handling setup
    const cookieHandler = (createServerClient as any).mock.calls[0][2].cookies;
    expect(cookieHandler.getAll).toBeDefined();
    expect(cookieHandler.setAll).toBeDefined();
  });

  it('should clear malformed Supabase auth cookies before getClaims', async () => {
    mockRequest.cookies.getAll = () => [
      {
        name: 'sb-test-auth-token',
        value: 'base64-eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ',
      },
      { name: 'other', value: '1' },
    ];

    await updateSession(mockRequest as any);

    const cookieHandler = (createServerClient as any).mock.calls[0][2].cookies;
    expect(cookieHandler.getAll()).toEqual([{ name: 'other', value: '1' }]);
    expect(mockRequest.cookies.set).toHaveBeenCalledWith(
      'sb-test-auth-token',
      ''
    );
  });

  it('should return response and JWT Payload', async () => {
    const response = await updateSession(mockRequest as any);
    expect(response.res).toBeDefined();
    expect(response.res.headers).toBeDefined();
    expect(response.claims).toBeNull();
  });
});
