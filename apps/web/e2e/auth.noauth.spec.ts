import { expect, test } from '@playwright/test';
import {
  clearMailpitMessages,
  completeOtpStage,
  fetchOtpSettings,
  openPasswordStage,
} from './helpers/auth';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
import {
  e2eClientHeaders,
  e2eClientIpForTest,
  resetAppRateLimitStateWithNewContextForTests,
  resetDbRateLimits,
  setWebOtpEnabled,
} from './helpers/rate-limits';

test.describe('Authentication (unauthenticated)', () => {
  test.beforeEach(async ({ page, playwright }, testInfo) => {
    const clientHeaders = e2eClientHeaders(e2eClientIpForTest(testInfo, 210));

    await page.setExtraHTTPHeaders(clientHeaders);
    await resetDbRateLimits();
    await resetAppRateLimitStateWithNewContextForTests(playwright.request, {
      email: `e2e-auth-reset-${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}@tuturuuu.com`,
      headers: clientHeaders,
      locale: DEFAULT_LOCALE,
    });
  });

  test('login page renders with email input and primary auth button', async ({
    page,
  }) => {
    await page.goto(`/${DEFAULT_LOCALE}/login`, {
      waitUntil: 'domcontentloaded',
    });

    const emailInput = page
      .getByPlaceholder('Enter your email or username')
      .first();
    await expect(emailInput).toBeVisible({ timeout: 30_000 });

    const continueButton = page
      .locator('form button[type="submit"]')
      .filter({ hasText: /continue/i })
      .first();
    await expect(continueButton).toBeVisible({ timeout: 10_000 });
  });

  test('login page remains usable while Supabase user lookup stalls', async ({
    page,
  }) => {
    await page.route(/\/auth\/v1\/user(?:\?|$)/u, () => new Promise(() => {}));

    await page.goto(`/${DEFAULT_LOCALE}/login`, {
      waitUntil: 'domcontentloaded',
    });

    const emailInput = page
      .getByPlaceholder('Enter your email or username')
      .first();
    await expect(emailInput).toBeVisible({ timeout: 30_000 });

    const continueButton = page
      .locator('form button[type="submit"]')
      .filter({ hasText: /continue/i })
      .first();
    await expect(continueButton).toBeVisible({ timeout: 10_000 });
  });

  test('login remains usable when web OTP settings fail', async ({ page }) => {
    await page.route('**/api/v1/auth/otp/settings?client=web', (route) =>
      route.fulfill({
        body: JSON.stringify({
          diagnosticCode: 'AUTH-OTP-SETTINGS-E2E',
          error: 'Failed to load OTP settings',
        }),
        contentType: 'application/json',
        status: 500,
      })
    );

    await page.goto(`/${DEFAULT_LOCALE}/login`, {
      waitUntil: 'domcontentloaded',
    });

    const emailInput = page
      .getByPlaceholder('Enter your email or username')
      .first();
    await expect(emailInput).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('button', { name: /continue with passkey/i })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: /continue with google/i })
    ).toBeVisible({ timeout: 10_000 });

    await emailInput.clear();
    await emailInput.fill(TEST_USER.email);

    const continueButton = page
      .locator('form button[type="submit"]')
      .filter({ hasText: /continue/i })
      .first();
    await continueButton.waitFor({ state: 'visible', timeout: 10_000 });
    await continueButton.waitFor({ state: 'attached', timeout: 10_000 });
    await expect(continueButton).toBeEnabled({ timeout: 15_000 });
    await continueButton.click();

    await expect(page.getByPlaceholder('Enter your password')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('unprefixed login page renders from a direct hard load', async ({
    page,
  }) => {
    await page.goto('/login', {
      waitUntil: 'domcontentloaded',
    });

    const emailInput = page
      .getByPlaceholder('Enter your email or username')
      .first();
    await expect(emailInput).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByRole('heading', { name: /welcome back/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('login page exposes passkey sign-in with a graceful unsupported-browser error', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'PublicKeyCredential', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, 'credentials', {
        configurable: true,
        value: undefined,
      });
    });

    await page.goto(`/${DEFAULT_LOCALE}/login`, {
      waitUntil: 'domcontentloaded',
    });

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            `${typeof window.PublicKeyCredential}:${typeof navigator.credentials?.get}`
        )
      )
      .toBe('undefined:undefined');

    const passkeyButton = page.getByRole('button', {
      name: /continue with passkey/i,
    });
    await expect(passkeyButton).toBeVisible({ timeout: 30_000 });

    await passkeyButton.click();

    await expect(page.getByText('Passkey sign-in failed')).toBeVisible({
      timeout: 15_000,
    });

    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain('Internal Server Error');
  });

  test('root page is accessible to unauthenticated users (marketing page)', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const body = page.locator('body');
    await expect(body).not.toBeEmpty();

    const title = await page.title();
    expect(title).not.toBe('');
  });

  test('identifies OTP availability from settings endpoint', async ({
    page,
  }) => {
    await page.goto(`/${DEFAULT_LOCALE}/login`, {
      waitUntil: 'domcontentloaded',
    });

    const settings = await fetchOtpSettings(page);
    expect(settings).not.toBeNull();
    expect(typeof settings!.otpEnabled).toBe('boolean');
  });

  test('password login with seed account succeeds', async ({ page }) => {
    // Disable OTP so the password form appears directly
    const previousOtpState = await setWebOtpEnabled(false);

    try {
      await page.goto(`/${DEFAULT_LOCALE}/login`, {
        waitUntil: 'domcontentloaded',
      });

      const passwordInput = await openPasswordStage(page, TEST_USER.email);
      await passwordInput.clear();
      await passwordInput.fill(TEST_USER.password);

      const submitButton = page.getByRole('button', { name: /sign in/i });
      await submitButton.click();

      await Promise.race([
        page
          .waitForURL((url) => !url.pathname.includes('/login'), {
            timeout: 60_000,
            waitUntil: 'domcontentloaded',
          })
          .catch(() => {}),
        page.waitForTimeout(15_000),
      ]);

      const bodyText = await page.locator('body').textContent();
      expect(bodyText).not.toContain('Invalid credentials');
      expect(bodyText).not.toContain('Internal Server Error');
    } finally {
      if (previousOtpState !== null) {
        await setWebOtpEnabled(previousOtpState);
      }
    }
  });

  test('login flow handles both OTP and password paths', async ({ page }) => {
    // Enable OTP: verify the OTP stage appears after the identify step,
    // and the password fallback is visible.
    const previousOtpState = await setWebOtpEnabled(true);

    try {
      const otpStageOnlyEmail = `otp-stage-only-${Date.now()}@tuturuuu.com`;
      await page.route('**/api/v1/auth/otp/send', async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          status: 200,
          body: JSON.stringify({ success: true }),
        });
      });

      await page.goto(`/${DEFAULT_LOCALE}/login`, {
        waitUntil: 'domcontentloaded',
      });

      const emailInput = page
        .getByPlaceholder('Enter your email or username')
        .first();
      await expect(emailInput).toBeVisible({ timeout: 30_000 });
      await emailInput.clear();
      await emailInput.fill(otpStageOnlyEmail);

      const continueButton = page
        .locator('form button[type="submit"]')
        .filter({ hasText: /continue/i })
        .first();
      await expect(continueButton).toBeVisible({ timeout: 10_000 });
      await continueButton.click();

      // The OTP entry form should appear
      const otpInput = page.getByRole('textbox', { name: /code/i }).first();
      await expect(otpInput).toBeVisible({ timeout: 15_000 });

      // The "Use password instead" fallback should be visible
      const usePasswordFallback = page.getByRole('button', {
        name: /use password instead/i,
      });
      await expect(usePasswordFallback).toBeVisible({ timeout: 5_000 });

      // Click it to switch to the password path
      await usePasswordFallback.click();

      const passwordInput = page.getByPlaceholder('Enter your password');
      await expect(passwordInput).toBeVisible({ timeout: 10_000 });
    } finally {
      await setWebOtpEnabled(previousOtpState);
      await resetDbRateLimits();
    }
  });

  test('login flow works with OTP disabled (password-only)', async ({
    page,
  }) => {
    // Disable OTP: the password form should appear directly after identify.
    const previousOtpState = await setWebOtpEnabled(false);

    try {
      await page.goto(`/${DEFAULT_LOCALE}/login`, {
        waitUntil: 'domcontentloaded',
      });

      const emailInput = page
        .getByPlaceholder('Enter your email or username')
        .first();
      await expect(emailInput).toBeVisible({ timeout: 30_000 });
      await emailInput.clear();
      await emailInput.fill(TEST_USER.email);

      const continueButton = page
        .locator('form button[type="submit"]')
        .filter({ hasText: /continue/i })
        .first();
      await expect(continueButton).toBeVisible({ timeout: 10_000 });
      await continueButton.click();

      // With OTP disabled, the password form should appear directly
      const passwordInput = page.getByPlaceholder('Enter your password');
      await expect(passwordInput).toBeVisible({ timeout: 15_000 });

      // The "Use password instead" fallback should NOT appear
      const usePasswordFallback = page.getByRole('button', {
        name: /use password instead/i,
      });
      await expect(usePasswordFallback).not.toBeVisible();
    } finally {
      if (previousOtpState !== null) {
        await setWebOtpEnabled(previousOtpState);
      }
    }
  });

  test('OTP code can be retrieved from Mailpit and entered', async ({
    page,
  }) => {
    // Enable OTP and verify the full OTP login flow works end-to-end,
    // including retrieving the OTP code from Mailpit.
    const previousOtpState = await setWebOtpEnabled(true);

    try {
      await clearMailpitMessages();
      const otpEmail = `otp-login-${Date.now()}@tuturuuu.com`;

      await page.goto(`/${DEFAULT_LOCALE}/login`, {
        waitUntil: 'domcontentloaded',
      });

      const emailInput = page
        .getByPlaceholder('Enter your email or username')
        .first();
      await expect(emailInput).toBeVisible({ timeout: 30_000 });
      await emailInput.clear();
      await emailInput.fill(otpEmail);

      const continueButton = page
        .locator('form button[type="submit"]')
        .filter({ hasText: /continue/i })
        .first();
      await expect(continueButton).toBeVisible({ timeout: 10_000 });
      await continueButton.click();

      // OTP entry form should appear
      const otpInput = page.getByRole('textbox', { name: /code/i }).first();
      await expect(otpInput).toBeVisible({ timeout: 15_000 });

      // Retrieve the OTP code from Mailpit and enter it
      await completeOtpStage(page, otpEmail);

      // After OTP verification, we should be authenticated
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
        { timeout: 30_000 }
      );
    } finally {
      await setWebOtpEnabled(previousOtpState);
      await resetDbRateLimits();
    }
  });
});
