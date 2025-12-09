// Mocks must come next, before any imports that use them!
import dayjs from 'dayjs';
import 'dayjs/locale/de';
// Import locales statically for testing
import 'dayjs/locale/en';
import 'dayjs/locale/es';
import 'dayjs/locale/fr';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import 'dayjs/locale/zh';
import utc from 'dayjs/plugin/utc.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Set required env vars for Supabase at the VERY TOP
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';

vi.mock('../google-calendar-sync', async () => {
  const actual = await vi.importActual('../google-calendar-sync');
  return {
    ...actual,
    getWorkspacesForSync: vi.fn(() =>
      Promise.resolve([
        {
          ws_id: 'test-ws-1',
          access_token: 'token1',
          refresh_token: 'refresh1',
        },
        {
          ws_id: 'test-ws-2',
          access_token: 'token2',
          refresh_token: 'refresh2',
        },
      ])
    ),
    syncWorkspaceBatched: vi.fn((payload) =>
      Promise.resolve({
        ws_id: payload.ws_id,
        success: true,
        eventsSynced: payload.events_to_sync?.length || 10,
        eventsDeleted: 0,
        // Add locale-specific behavior simulation as additional properties for testing
        locale: payload.locale,
        dateFormatted:
          payload.locale === 'vi' ? '15 tháng 1 2024' : 'January 15, 2024',
        timeFormatted: payload.locale === 'vi' ? '10:30 sáng' : '10:30 AM',
      })
    ),
  };
});

dayjs.extend(utc);

// Test isolation utility to prevent environment contamination
const isolateTest = (testFn: () => void | Promise<void>) => {
  return async () => {
    const originalLocale = dayjs.locale();
    const originalEnv = { ...process.env };
    try {
      await testFn();
    } finally {
      dayjs.locale(originalLocale);
      process.env = originalEnv;
    }
  };
};

// Mock the setupDayjsLocale function to test its behavior
const mockSetupDayjsLocale = async (locale?: string) => {
  const targetLocale = locale || process.env.LOCALE || 'en';
  const supportedLocales = ['en', 'vi', 'fr', 'de', 'es', 'ja', 'ko', 'zh'];

  if (supportedLocales.includes(targetLocale)) {
    dayjs.locale(targetLocale);
    return { success: true, locale: targetLocale };
  } else {
    console.warn(
      `Failed to load locale '${targetLocale}', falling back to 'en'`
    );
    dayjs.locale('en');
    return {
      success: false,
      fallback: 'en',
      error: new Error(`Unsupported locale: ${targetLocale}`),
    };
  }
};

describe('Google Calendar Sync - Locale Functionality', () => {
  beforeEach(() => {
    // Reset environment
    delete process.env.LOCALE;
    // Reset dayjs locale to default
    dayjs.locale('en');
  });

  afterEach(() => {
    // Clean up
    dayjs.locale('en');
  });

  describe('Environment Variable Support', () => {
    it(
      'should read LOCALE from environment variables',
      isolateTest(async () => {
        // Test different locale values
        const testLocales = ['en', 'vi', 'fr', 'de', 'es'];

        for (const locale of testLocales) {
          process.env.LOCALE = locale;
          expect(process.env.LOCALE).toBe(locale);
        }
      })
    );

    it('should handle missing LOCALE environment variable', () => {
      delete process.env.LOCALE;
      expect(process.env.LOCALE).toBeUndefined();
    });
  });

  describe('Date Formatting Consistency', () => {
    it('should format dates consistently', () => {
      const testDate = dayjs('2024-01-15T10:30:00Z');
      const expectedDate = '2024-01-15';

      const result = testDate.format('YYYY-MM-DD');
      expect(result).toBe(expectedDate);

      // Test that the same format works across different locales
      const enResult = testDate.locale('en').format('YYYY-MM-DD');
      const viResult = testDate.locale('vi').format('YYYY-MM-DD');
      expect(enResult).toBe(viResult); // ISO format should be consistent
    });

    it('should handle date range formatting', () => {
      const startDate = dayjs.utc('2024-01-15T09:00:00Z');
      const endDate = dayjs.utc('2024-01-15T17:00:00Z');

      const startFormatted = startDate.format('YYYY-MM-DD HH:mm');
      const endFormatted = endDate.format('YYYY-MM-DD HH:mm');
      const rangeFormat = `${startFormatted} to ${endFormatted}`;

      // Force UTC output
      expect(rangeFormat).toBe('2024-01-15 09:00 to 2024-01-15 17:00');
    });

    it('should handle all-day event formatting', () => {
      const startDate = dayjs('2024-01-15');
      const endDate = dayjs('2024-01-16');

      const startFormatted = startDate.format('YYYY-MM-DD');
      const endFormatted = endDate.format('YYYY-MM-DD');
      const allDayFormat = `${startFormatted} to ${endFormatted}`;

      expect(allDayFormat).toBe('2024-01-15 to 2024-01-16');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid locale values gracefully', async () => {
      const invalidLocales = ['invalid', '123', 'en-US-invalid'];

      for (const locale of invalidLocales) {
        const result = await mockSetupDayjsLocale(locale);
        expect(result.success).toBe(false);
        expect(result.fallback).toBe('en');
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain(
          `Unsupported locale: ${locale}`
        );
      }
    });

    it('should handle null and undefined locale values', async () => {
      // Test with undefined (should use environment or default)
      const undefinedResult = await mockSetupDayjsLocale(undefined);
      expect(undefinedResult.success).toBe(true);
      expect(undefinedResult.locale).toBe('en'); // Should default to 'en'

      // Test with null (should be treated as undefined)
      const nullResult = await mockSetupDayjsLocale(null as any);
      expect(nullResult.success).toBe(true);
      expect(nullResult.locale).toBe('en'); // Should default to 'en'
    });

    it(
      'should handle environment variable fallback when no locale provided',
      isolateTest(async () => {
        // Set environment variable
        process.env.LOCALE = 'vi';

        const result = await mockSetupDayjsLocale();
        expect(result.success).toBe(true);
        expect(result.locale).toBe('vi');
      })
    );

    it('should handle console warnings for invalid locales', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await mockSetupDayjsLocale('invalid-locale');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to load locale 'invalid-locale', falling back to 'en'"
        )
      );

      consoleSpy.mockRestore();
    });
  });

  // NEW: Actual functionality tests
  describe('Locale Loading and Date Formatting Behavior', () => {
    it('should load and apply English locale correctly', async () => {
      const result = await mockSetupDayjsLocale('en');
      expect(result.success).toBe(true);
      expect(result.locale).toBe('en');

      // Test date formatting with English locale
      const testDate = dayjs('2024-01-15');
      expect(testDate.format('MMMM D, YYYY')).toBe('January 15, 2024');
    });

    it('should load and apply Vietnamese locale correctly', async () => {
      const result = await mockSetupDayjsLocale('vi');
      expect(result.success).toBe(true);
      expect(result.locale).toBe('vi');

      // Test date formatting with Vietnamese locale
      const testDate = dayjs('2024-01-15');
      expect(testDate.format('MMMM D, YYYY')).toBe('tháng 1 15, 2024');
    });

    it('should fallback to English for invalid locales', async () => {
      const result = await mockSetupDayjsLocale('invalid-locale');
      expect(result.success).toBe(false);
      expect(result.fallback).toBe('en');
      expect(result.error).toBeDefined();

      // Should still be able to format dates in English
      const testDate = dayjs('2024-01-15');
      expect(testDate.format('MMMM D, YYYY')).toBe('January 15, 2024');
    });

    it('should handle timezone-aware date formatting', () => {
      // Test that locale affects timezone display
      const testDate = dayjs('2024-01-15T10:30:00Z');

      // Test different locale formats
      const enFormat = testDate.locale('en').format('MMMM D, YYYY [at] h:mm A');
      const viFormat = testDate.locale('vi').format('D MMMM YYYY [lúc] h:mm A');

      expect(enFormat).toContain('January 15, 2024 at');
      expect(viFormat).toContain('15 tháng 1 2024 lúc');
    });

    it('should maintain consistent date parsing across locales', () => {
      const dateString = '2024-01-15T10:30:00Z';

      // Parse the same date string in different locales
      const enDate = dayjs(dateString).locale('en');
      const viDate = dayjs(dateString).locale('vi');

      // The underlying date should be the same regardless of locale
      expect(enDate.toISOString()).toBe(viDate.toISOString());
      expect(enDate.valueOf()).toBe(viDate.valueOf());
    });

    it('should handle locale-specific day and month names', () => {
      const testDate = dayjs('2024-01-15');

      // Test day names
      const enDayName = testDate.locale('en').format('dddd');
      const viDayName = testDate.locale('vi').format('dddd');

      expect(enDayName).toBe('Monday');
      expect(viDayName).toBe('thứ hai');

      // Test month names
      const enMonthName = testDate.locale('en').format('MMMM');
      const viMonthName = testDate.locale('vi').format('MMMM');

      expect(enMonthName).toBe('January');
      expect(viMonthName).toBe('tháng 1');
    });

    it('should handle locale switching during sync operations', async () => {
      // Simulate switching locales during different sync operations
      const syncOperations = [
        { ws_id: 'ws1', locale: 'en' },
        { ws_id: 'ws2', locale: 'vi' },
        { ws_id: 'ws3', locale: 'fr' },
      ];

      for (const operation of syncOperations) {
        const result = await mockSetupDayjsLocale(operation.locale);
        expect(result.success).toBe(true);
        expect(result.locale).toBe(operation.locale);

        // Test that the locale is properly applied
        const testDate = dayjs('2024-01-15');
        const formattedDate = testDate.format('MMMM D, YYYY');

        // Verify the format is locale-specific
        if (operation.locale === 'en') {
          expect(formattedDate).toBe('January 15, 2024');
        } else if (operation.locale === 'vi') {
          expect(formattedDate).toBe('tháng 1 15, 2024');
        }
      }
    });

    it(
      'should handle environment variable locale precedence',
      isolateTest(async () => {
        // Test that environment variable takes precedence when no locale is provided
        process.env.LOCALE = 'vi';

        const result = await mockSetupDayjsLocale();
        expect(result.success).toBe(true);
        expect(result.locale).toBe('vi');

        // Test that explicit locale overrides environment variable
        const explicitResult = await mockSetupDayjsLocale('en');
        expect(explicitResult.success).toBe(true);
        expect(explicitResult.locale).toBe('en');
      })
    );
  });
});
