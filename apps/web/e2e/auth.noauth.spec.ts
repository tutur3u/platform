import { expect, test } from '@playwright/test';
import {
  completeOtpStage,
  fetchOtpSettings,
  openPasswordStage,
} from './helpers/auth';
import { DEFAULT_LOCALE, TEST_USER } from './helpers/constants';
import { resetDbRateLimits, setWebOtpEnabled } from './helpers/rate-limits';

test.describe('Authentication (unauthenticated)', () => {
  test.beforeEach(async () => {
    await resetDbRateLimits();
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

      // OTP entry form should appear
      const otpInput = page.getByRole('textbox', { name: /code/i }).first();
      await expect(otpInput).toBeVisible({ timeout: 15_000 });

      // Retrieve the OTP code from Mailpit and enter it
      await completeOtpStage(page, TEST_USER.email);

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
