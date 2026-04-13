import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendOtp: vi.fn(),
  toOtpErrorResult: vi.fn(),
}));

vi.mock('@/lib/auth/otp', () => ({
  sendOtp: (...args: Parameters<typeof mocks.sendOtp>) =>
    mocks.sendOtp(...args),
  toOtpErrorResult: (...args: Parameters<typeof mocks.toOtpErrorResult>) =>
    mocks.toOtpErrorResult(...args),
}));

describe('mobile send-otp route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.toOtpErrorResult.mockReturnValue({
      body: { error: 'Unable to send a verification code right now.' },
      status: 500,
    });
  });

  it('delegates to the shared OTP service with a mobile client context', async () => {
    mocks.sendOtp.mockResolvedValue({
      body: { success: true },
      status: 200,
    });

    const { POST } = await import('@/app/api/v1/auth/mobile/send-otp/route');
    const response = await POST(
      new NextRequest('http://localhost/api/v1/auth/mobile/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'person@example.com',
          locale: 'en',
          platform: 'ios',
        }),
      })
    );

    expect(mocks.sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        client: 'mobile',
        email: 'person@example.com',
        platform: 'ios',
      }),
      expect.objectContaining({
        client: 'mobile',
        endpoint: '/api/v1/auth/mobile/send-otp',
        platform: 'ios',
      })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
