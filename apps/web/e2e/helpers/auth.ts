import type { Locator, Page } from '@playwright/test';
import {
  AUTH_STATE_PATH,
  DASHBOARD_URL,
  DEFAULT_LOCALE,
  TEST_USER,
} from './constants';
import { resetDbRateLimits, setWebOtpEnabled } from './rate-limits';

/** Mailpit API base URL for retrieving OTP codes in local dev/E2E. */
const MAILPIT_API_URL = 'http://localhost:8004/api/v1';
const DEV_SESSION_URL = '/api/auth/dev-session';

let previousOtpState: boolean | null = null;

/**
 * Fetches the most recent OTP code sent to the given email from Mailpit.
 * Polls until a code is found or the timeout expires.
 */
export async function fetchOtpCodeFromMailpit(
  email: string,
  options: { timeout?: number; pollInterval?: number } = {}
): Promise<string | null> {
  const { timeout = 15_000, pollInterval = 1_000 } = options;
  const deadline = Date.now() + timeout;
  const seenIds = new Set<string>();

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${MAILPIT_API_URL}/messages`);
      if (!response.ok) continue;

      const data = (await response.json()) as {
        messages: Array<{
          ID: string;
          To: Array<{ Address: string }>;
          Subject: string;
          Created: string;
        }>;
      };

      // Find the most recent OTP email to the target address
      const otpEmails = data.messages
        .filter(
          (m) =>
            m.To.some((a) => a.Address === email) &&
            m.Subject.includes('Verification Code')
        )
        .sort(
          (a, b) =>
            new Date(b.Created).getTime() - new Date(a.Created).getTime()
        );

      for (const msg of otpEmails) {
        if (seenIds.has(msg.ID)) continue;
        seenIds.add(msg.ID);

        // Fetch the full message to extract the OTP code
        const msgResponse = await fetch(`${MAILPIT_API_URL}/message/${msg.ID}`);
        if (!msgResponse.ok) continue;

        const msgData = (await msgResponse.json()) as { Text?: string };
        const text = msgData.Text || '';
        const codeMatch = text.match(/\b(\d{6})\b/);
        if (codeMatch) {
          return codeMatch[1];
        }
      }
    } catch {
      // Mailpit not available or parse error — keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return null;
}

/**
 * Authenticates via the password login form and saves browser state.
 *
 * Strategy:
 *  1. Disable web OTP to ensure the password form appears directly
 *  2. Reset auth rate limits
 *  3. Navigate to the login page
 *  4. Fill in the email, advance past the identify step
 *  5. Fill in the password form with seed test credentials
 *  6. Submit — the app's Supabase browser client stores the session in cookies
 *  7. Wait for the post-login redirect (middleware redirects authenticated users)
 *  8. Restore OTP to its original setting
 *  9. Save storageState so subsequent tests skip login entirely
 *
 * Why UI-based login instead of API-based:
 *  - The app's createBrowserClient stores sessions in cookies (not localStorage).
 *  - A standalone createClient from @supabase/supabase-js uses localStorage instead,
 *    so page.evaluate() with a fresh client won't set the right cookies.
 *  - Server-side auth callbacks set HttpOnly cookies that storageState() can't capture.
 *  - The UI form uses the correctly configured client, so cookies persist properly.
 */
export async function authenticateTestUser(page: Page): Promise<void> {
  await resetDbRateLimits();

  try {
    await authenticateViaDevSession(page);
  } catch {
    previousOtpState = await setWebOtpEnabled(false);

    try {
      await authenticateViaPasswordUi(page);
    } finally {
      if (previousOtpState !== null) {
        await setWebOtpEnabled(previousOtpState);
      }
    }
  }

  await page.context().storageState({ path: AUTH_STATE_PATH });
}

async function authenticateViaDevSession(page: Page): Promise<void> {
  const response = await page.request.post(DEV_SESSION_URL, {
    data: {
      email: TEST_USER.email,
      locale: DEFAULT_LOCALE,
    },
    failOnStatusCode: false,
  });

  if (!response.ok()) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `Dev session failed with status ${response.status()}: ${errorBody}`
    );
  }
  await verifyAuthenticatedSession(page);
}

async function authenticateViaPasswordUi(page: Page): Promise<void> {
  await page.goto('/login', {
    waitUntil: 'domcontentloaded',
  });

  const passwordInput = await openPasswordStage(page, TEST_USER.email);
  await passwordInput.clear();
  await passwordInput.fill(TEST_USER.password);

  await page
    .getByRole('button', { name: /sign in/i })
    .first()
    .click();

  await verifyAuthenticatedSession(page);
}

async function verifyAuthenticatedSession(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      try {
        const response = await fetch('/api/v1/users/me/profile', {
          cache: 'no-store',
        });
        if (!response.ok) return false;
        const data = await response.json();
        return Boolean(data?.id);
      } catch {
        return false;
      }
    },
    { timeout: 60_000 }
  );

  // Force one server-rendered navigation so setup only succeeds when a
  // server-readable session cookie exists, not just a client-side auth state.
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(
    (url) =>
      !url.pathname.includes('/login') && !url.pathname.includes('/auth'),
    { timeout: 60_000, waitUntil: 'domcontentloaded' }
  );

  await page.waitForTimeout(1_000);
}

/**
 * Returns the current OTP settings for the web client.
 * Returns { otpEnabled: boolean } or null if the request fails.
 */
export async function fetchOtpSettings(
  page: Page
): Promise<{ otpEnabled: boolean } | null> {
  const response = await page.request.get(
    '/api/v1/auth/otp/settings?client=web'
  );
  if (!response.ok()) {
    return null;
  }
  return await response.json();
}

export async function openPasswordStage(
  page: Page,
  email: string
): Promise<Locator> {
  const emailInput = page
    .getByPlaceholder('Enter your email or username')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: 60_000 });
  await emailInput.clear();
  await emailInput.fill(email);

  const passwordInput = page.getByPlaceholder('Enter your password');
  if (await passwordInput.isVisible()) {
    return passwordInput;
  }

  const continueButton = page
    .locator('form button[type="submit"]')
    .filter({ hasText: /continue/i })
    .first();
  await continueButton.waitFor({ state: 'visible', timeout: 30_000 });
  await continueButton.waitFor({ enabled: true, timeout: 10_000 });
  await continueButton.click();

  // Wait for the form transition to complete.
  await page.waitForTimeout(1_000);

  // If OTP is enabled, the form transitions to an OTP entry stage.
  // Click "Use password instead" to fall back to password authentication.
  const usePasswordInstead = page.getByRole('button', {
    name: /use password instead/i,
  });

  if (
    await usePasswordInstead.isVisible({ timeout: 5_000 }).catch(() => false)
  ) {
    await usePasswordInstead.click();
  }

  await passwordInput.waitFor({ state: 'visible', timeout: 30_000 });

  return passwordInput;
}

/**
 * Complete the OTP stage by entering the code from Mailpit.
 * Call this after clicking "Continue with email" when OTP is enabled,
 * if you want to authenticate through the OTP path instead of falling
 * back to password.
 */
export async function completeOtpStage(
  page: Page,
  email: string
): Promise<void> {
  const otpCode = await fetchOtpCodeFromMailpit(email);
  if (!otpCode) {
    throw new Error(`Failed to retrieve OTP code for ${email} from Mailpit`);
  }

  const otpInput = page.getByRole('textbox', { name: /code/i }).first();
  await otpInput.waitFor({ state: 'visible', timeout: 10_000 });
  await otpInput.fill(otpCode);

  // Submit the OTP form
  const verifyButton = page.getByRole('button', { name: /verify|submit/i });
  if (await verifyButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await verifyButton.click();
  }
}
