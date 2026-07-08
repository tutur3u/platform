import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeVerifiedMfaSignIn } from '@/app/[locale]/(auth)/login/mfa-navigation';

describe('completeVerifiedMfaSignIn', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes the session, clears MFA state, and processes the post-login URL', async () => {
    const clearMfaRequirement = vi.fn();
    const fallbackToHome = vi.fn();
    const processNextUrl = vi.fn().mockResolvedValue(undefined);
    const refreshSession = vi.fn().mockResolvedValue({ error: null });
    const resetTotp = vi.fn();

    await completeVerifiedMfaSignIn({
      clearMfaRequirement,
      fallbackToHome,
      processNextUrl,
      refreshSession,
      resetTotp,
    });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(clearMfaRequirement).toHaveBeenCalledTimes(1);
    expect(resetTotp).toHaveBeenCalledTimes(1);
    expect(processNextUrl).toHaveBeenCalledTimes(1);
    expect(fallbackToHome).not.toHaveBeenCalled();
    expect(refreshSession.mock.invocationCallOrder[0]).toBeLessThan(
      processNextUrl.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it('falls back home when navigation fails after a verified MFA code', async () => {
    const navigationError = new Error('Invalid returnUrl');
    const fallbackToHome = vi.fn();
    const onNavigationError = vi.fn();

    await completeVerifiedMfaSignIn({
      clearMfaRequirement: vi.fn(),
      fallbackToHome,
      onNavigationError,
      processNextUrl: vi.fn().mockRejectedValue(navigationError),
      refreshSession: vi.fn().mockResolvedValue({ error: null }),
      resetTotp: vi.fn(),
    });

    expect(onNavigationError).toHaveBeenCalledWith(navigationError);
    expect(fallbackToHome).toHaveBeenCalledTimes(1);
  });

  it('does not block navigation when the post-MFA session refresh reports an error', async () => {
    const refreshError = new Error('refresh failed');
    const onSessionRefreshError = vi.fn();
    const processNextUrl = vi.fn().mockResolvedValue(undefined);

    await completeVerifiedMfaSignIn({
      clearMfaRequirement: vi.fn(),
      fallbackToHome: vi.fn(),
      onSessionRefreshError,
      processNextUrl,
      refreshSession: vi.fn().mockResolvedValue({ error: refreshError }),
      resetTotp: vi.fn(),
    });

    expect(onSessionRefreshError).toHaveBeenCalledWith(refreshError);
    expect(processNextUrl).toHaveBeenCalledTimes(1);
  });

  it('does not block navigation when the post-MFA session refresh stalls', async () => {
    vi.useFakeTimers();

    const onSessionRefreshError = vi.fn();
    const processNextUrl = vi.fn().mockResolvedValue(undefined);
    const refreshSession = vi.fn(() => new Promise<never>(() => undefined));

    const signInPromise = completeVerifiedMfaSignIn({
      clearMfaRequirement: vi.fn(),
      fallbackToHome: vi.fn(),
      onSessionRefreshError,
      processNextUrl,
      refreshSession,
      resetTotp: vi.fn(),
      sessionRefreshTimeoutMs: 25,
    });

    await vi.advanceTimersByTimeAsync(25);
    await signInPromise;

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(onSessionRefreshError).toHaveBeenCalledWith(expect.any(Error));
    expect(processNextUrl).toHaveBeenCalledTimes(1);
  });
});
