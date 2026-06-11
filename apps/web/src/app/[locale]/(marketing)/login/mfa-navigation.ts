interface CompleteVerifiedMfaSignInOptions {
  clearMfaRequirement: () => void;
  fallbackToHome: () => void;
  onNavigationError?: (error: unknown) => void;
  onSessionRefreshError?: (error: unknown) => void;
  processNextUrl: () => Promise<void>;
  refreshSession: () => Promise<{ error?: unknown } | null | undefined>;
  resetTotp: () => void;
  sessionRefreshTimeoutMs?: number;
}

const DEFAULT_SESSION_REFRESH_TIMEOUT_MS = 3000;

async function refreshSessionWithTimeout(
  refreshSession: CompleteVerifiedMfaSignInOptions['refreshSession'],
  timeoutMs: number
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<{ error: Error }>((resolve) => {
      timeoutId = globalThis.setTimeout(() => {
        timeoutId = undefined;
        resolve({
          error: new Error(
            `Session refresh timed out after ${timeoutMs.toString()}ms`
          ),
        });
      }, timeoutMs);
    });

    return await Promise.race([refreshSession(), timeout]);
  } finally {
    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}

export async function completeVerifiedMfaSignIn({
  clearMfaRequirement,
  fallbackToHome,
  onNavigationError,
  onSessionRefreshError,
  processNextUrl,
  refreshSession,
  resetTotp,
  sessionRefreshTimeoutMs = DEFAULT_SESSION_REFRESH_TIMEOUT_MS,
}: CompleteVerifiedMfaSignInOptions) {
  try {
    const refreshResult = await refreshSessionWithTimeout(
      refreshSession,
      sessionRefreshTimeoutMs
    );
    if (refreshResult?.error) {
      onSessionRefreshError?.(refreshResult.error);
    }
  } catch (error) {
    onSessionRefreshError?.(error);
  }

  clearMfaRequirement();
  resetTotp();

  try {
    await processNextUrl();
  } catch (error) {
    onNavigationError?.(error);
    fallbackToHome();
  }
}
