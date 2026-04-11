import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPublicOtpSettings: vi.fn(),
}));

vi.mock('@/lib/auth/otp', () => ({
  getPublicOtpSettings: (
    ...args: Parameters<typeof mocks.getPublicOtpSettings>
  ) => mocks.getPublicOtpSettings(...args),
}));

describe('otp settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows web requests without a platform query param', async () => {
    mocks.getPublicOtpSettings.mockResolvedValue({ otpEnabled: true });

    const { GET } = await import('@/app/api/v1/auth/otp/settings/route');
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/auth/otp/settings?client=web&platform='
      )
    );

    expect(mocks.getPublicOtpSettings).toHaveBeenCalledWith({
      client: 'web',
      platform: undefined,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ otpEnabled: true });
  });
});
