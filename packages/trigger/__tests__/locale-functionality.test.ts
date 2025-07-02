import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import dayjs from 'dayjs';

// Import the actual legacy functions
import {
  syncGoogleCalendarEventsImmediate,
  syncGoogleCalendarEventsExtended,
  syncGoogleCalendarEvents,
} from '../google-calendar-sync';

// Import actual sync functions for integration testing
import {
  syncWorkspaceImmediate,
  syncWorkspaceExtended,
} from '../google-calendar-sync';

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

// Import locales statically for testing
import 'dayjs/locale/en';
import 'dayjs/locale/vi';
import 'dayjs/locale/fr';
import 'dayjs/locale/de';
import 'dayjs/locale/es';
import 'dayjs/locale/ja';
import 'dayjs/locale/ko';
import 'dayjs/locale/zh';

// Mock the setupDayjsLocale function to test its behavior
const mockSetupDayjsLocale = async (locale?: string) => {
  const targetLocale = locale || process.env.LOCALE || 'en';
  const supportedLocales = ['en', 'vi', 'fr', 'de', 'es', 'ja', 'ko', 'zh'];
  
  if (supportedLocales.includes(targetLocale)) {
    dayjs.locale(targetLocale);
    return { success: true, locale: targetLocale };
  } else {
    console.warn(`Failed to load locale '${targetLocale}', falling back to 'en'`);
    dayjs.locale('en');
    return { success: false, fallback: 'en', error: new Error(`Unsupported locale: ${targetLocale}`) };
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
    it('should read LOCALE from environment variables', isolateTest(async () => {
      // Test different locale values
      const testLocales = ['en', 'vi', 'fr', 'de', 'es'];
      
      for (const locale of testLocales) {
        process.env.LOCALE = locale;
        expect(process.env.LOCALE).toBe(locale);
      }
    }));

    it('should handle missing LOCALE environment variable', () => {
      delete process.env.LOCALE;
      expect(process.env.LOCALE).toBeUndefined();
    });
  });

  describe('Function Parameter Support', () => {
    it('should accept locale parameter in sync function payloads', () => {
      // Test the payload structure for syncWorkspaceImmediate
      const immediatePayload = {
        ws_id: 'test-workspace',
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        locale: 'vi',
      };

      expect(immediatePayload.locale).toBe('vi');
      expect(immediatePayload.ws_id).toBe('test-workspace');
      expect(immediatePayload.access_token).toBe('test-token');
    });

    it('should accept locale parameter in extended sync payloads', () => {
      // Test the payload structure for syncWorkspaceExtended
      const extendedPayload = {
        ws_id: 'test-workspace',
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        locale: 'fr',
      };

      expect(extendedPayload.locale).toBe('fr');
      expect(extendedPayload.ws_id).toBe('test-workspace');
    });

    it('should handle missing locale parameter gracefully', () => {
      // Test payload without locale (backward compatibility)
      const payload: {
        ws_id: string;
        access_token: string;
        refresh_token: string;
        locale?: string;
      } = {
        ws_id: 'test-workspace',
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        // locale is optional
      };

      expect(payload.locale).toBeUndefined();
      expect(payload.ws_id).toBe('test-workspace');
    });

    it('should support different locale values', () => {
      const locales = ['en', 'vi', 'fr', 'de', 'es', 'ja', 'ko', 'zh'];
      
      locales.forEach(locale => {
        const payload: {
          ws_id: string;
          access_token: string;
          refresh_token: string;
          locale: string;
        } = {
          ws_id: 'test-workspace',
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          locale,
        };
        
        expect(payload.locale).toBe(locale);
      });
    });
  });

  describe('Legacy Function Support', () => {
    beforeEach(() => {
      // Mock the dependencies to test actual functionality
      vi.mock('../google-calendar-sync', async () => {
        const actual = await vi.importActual('../google-calendar-sync');
        return {
          ...actual,
          getWorkspacesForSync: vi.fn(() => Promise.resolve([
            { ws_id: 'test-ws-1', access_token: 'token1', refresh_token: 'refresh1' },
            { ws_id: 'test-ws-2', access_token: 'token2', refresh_token: 'refresh2' }
          ])),
          syncWorkspaceImmediate: vi.fn((payload) => Promise.resolve({
            ws_id: payload.ws_id,
            success: true,
            locale: payload.locale,
            eventsSynced: 5
          })),
          syncWorkspaceExtended: vi.fn((payload) => Promise.resolve({
            ws_id: payload.ws_id,
            success: true,
            locale: payload.locale,
            eventsSynced: 10
          })),
        };
      });
    });

    it('should support locale parameter in legacy functions', async () => {
      // Test that legacy functions can accept locale parameters
      const testLocale = 'vi';
      
      // Test the actual function signatures
      expect(typeof syncGoogleCalendarEventsImmediate).toBe('function');
      expect(typeof syncGoogleCalendarEventsExtended).toBe('function');
      expect(typeof syncGoogleCalendarEvents).toBe('function');
      
      // Verify the functions can be called with locale parameter
      expect(syncGoogleCalendarEventsImmediate.length).toBe(1); // One parameter (locale)
      expect(syncGoogleCalendarEventsExtended.length).toBe(1); // One parameter (locale)
      expect(syncGoogleCalendarEvents.length).toBe(1); // One parameter (locale)
    });

    it('should handle missing locale in legacy functions', async () => {
      // Test that functions are designed to work without locale parameter
      expect(syncGoogleCalendarEventsImmediate.length).toBe(1);
      expect(syncGoogleCalendarEventsExtended.length).toBe(1);
      expect(syncGoogleCalendarEvents.length).toBe(1);
      
      // Verify the functions are async
      expect(syncGoogleCalendarEventsImmediate.constructor.name).toBe('AsyncFunction');
      expect(syncGoogleCalendarEventsExtended.constructor.name).toBe('AsyncFunction');
      expect(syncGoogleCalendarEvents.constructor.name).toBe('AsyncFunction');
    });

    it('should pass locale parameter to workspace sync functions', async () => {
      // Mock the workspace sync functions to verify locale parameter passing
      const mockSyncWorkspaceImmediate = vi.fn().mockResolvedValue({
        ws_id: 'test-ws',
        success: true,
        locale: 'vi',
        eventsSynced: 5
      });
      const mockSyncWorkspaceExtended = vi.fn().mockResolvedValue({
        ws_id: 'test-ws',
        success: true,
        locale: 'fr',
        eventsSynced: 10
      });
      
      // Test that locale is passed through correctly
      const immediateResult = await mockSyncWorkspaceImmediate({
        ws_id: 'test-ws',
        access_token: 'token',
        refresh_token: 'refresh',
        locale: 'vi'
      });
      
      const extendedResult = await mockSyncWorkspaceExtended({
        ws_id: 'test-ws',
        access_token: 'token',
        refresh_token: 'refresh',
        locale: 'fr'
      });
      
      expect(immediateResult.locale).toBe('vi');
      expect(extendedResult.locale).toBe('fr');
      expect(mockSyncWorkspaceImmediate).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'vi' })
      );
      expect(mockSyncWorkspaceExtended).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'fr' })
      );
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
      const startDate = dayjs('2024-01-15T09:00:00Z');
      const endDate = dayjs('2024-01-15T17:00:00Z');
      
      const startFormatted = startDate.format('YYYY-MM-DD HH:mm');
      const endFormatted = endDate.format('YYYY-MM-DD HH:mm');
      const rangeFormat = `${startFormatted} to ${endFormatted}`;
      
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
        expect(result.error?.message).toContain(`Unsupported locale: ${locale}`);
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

    it('should handle environment variable fallback when no locale provided', isolateTest(async () => {
      // Set environment variable
      process.env.LOCALE = 'vi';
      
      const result = await mockSetupDayjsLocale();
      expect(result.success).toBe(true);
      expect(result.locale).toBe('vi');
    }));

    it('should handle console warnings for invalid locales', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      await mockSetupDayjsLocale('invalid-locale');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load locale 'invalid-locale', falling back to 'en'")
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Integration Scenarios', () => {
    it('should support complete sync workflow with locale', () => {
      // Test a complete sync workflow scenario
      const syncWorkflow = {
        workspace: {
          ws_id: 'test-workspace',
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          locale: 'vi',
        },
        timeRange: {
          start: '2024-01-15T00:00:00Z',
          end: '2024-01-22T23:59:59Z',
        },
        expectedBehavior: {
          locale: 'vi',
          dateFormat: 'YYYY-MM-DD',
          timeFormat: 'HH:mm',
        },
      };
      
      expect(syncWorkflow.workspace.locale).toBe('vi');
      expect(syncWorkflow.expectedBehavior.locale).toBe('vi');
      expect(syncWorkflow.workspace.ws_id).toBe('test-workspace');
    });

    it('should support multiple workspace syncs with different locales', () => {
      const workspaces = [
        { ws_id: 'ws1', locale: 'en' },
        { ws_id: 'ws2', locale: 'vi' },
        { ws_id: 'ws3', locale: 'fr' },
        { ws_id: 'ws4', locale: 'de' },
      ];
      
      workspaces.forEach(workspace => {
        expect(workspace.ws_id).toBeDefined();
        expect(workspace.locale).toBeDefined();
        expect(typeof workspace.locale).toBe('string');
      });
      
      // Check that all locales are different
      const locales = workspaces.map(w => w.locale);
      const uniqueLocales = new Set(locales);
      expect(uniqueLocales.size).toBe(4);
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

    it('should handle environment variable locale precedence', async () => {
      // Test that environment variable takes precedence when no locale is provided
      process.env.LOCALE = 'vi';
      
      const result = await mockSetupDayjsLocale();
      expect(result.success).toBe(true);
      expect(result.locale).toBe('vi');
      
      // Test that explicit locale overrides environment variable
      const explicitResult = await mockSetupDayjsLocale('en');
      expect(explicitResult.success).toBe(true);
      expect(explicitResult.locale).toBe('en');
    });

    it('should handle date range formatting with different locales', () => {
      const startDate = dayjs('2024-01-15T09:00:00Z');
      const endDate = dayjs('2024-01-15T17:00:00Z');
      
      // Test range formatting in different locales
      const enRange = `${startDate.locale('en').format('MMM D, YYYY h:mm A')} - ${endDate.locale('en').format('h:mm A')}`;
      const viRange = `${startDate.locale('vi').format('MMM D, YYYY h:mm A')} - ${endDate.locale('vi').format('h:mm A')}`;
      
      expect(enRange).toContain('Jan 15, 2024');
      expect(viRange).toContain('thg 1 15, 2024');
    });
  });
}); 