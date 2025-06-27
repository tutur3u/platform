import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSession } from '../middleware';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
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

describe('Supabase Middleware', () => {
  interface MockRequest extends NextRequest {
    headers: Headers;
    cookies: {
      getAll: () => Array<{ name: string; value: string }>;
    };
  }

  const mockRequest: MockRequest = {
    headers: new Headers(),
    cookies: {
      getAll: () => [],
    },
  } as MockRequest;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a response with the request', async () => {
    await updateSession(mockRequest);
    expect(NextResponse.next).toHaveBeenCalledWith({
      request: mockRequest,
    });
  });

  it('should check for user session', async () => {
    await updateSession(mockRequest);
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
    (
      createServerClient as MockedFunction<typeof createServerClient>
    ).mockImplementationOnce(() => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
      cookies: mockCookies,
    }));

    await updateSession(mockRequest);

    // Verify cookie handling setup
    const cookieHandler = (
      createServerClient as MockedFunction<typeof createServerClient>
    ).mock.calls[0][2].cookies;
    expect(cookieHandler.getAll).toBeDefined();
    expect(cookieHandler.setAll).toBeDefined();
  });

  it('should return response and user', async () => {
    const response = await updateSession(mockRequest);
    expect(response.res).toBeDefined();
    expect(response.res.headers).toBeDefined();
    expect(response.user).toBeNull();
  });
});
