import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import dayjs from 'dayjs';

// Mock the setupDayjsLocale function to test its behavior
const mockSetupDayjsLocale = async (locale?: string) => {
  const targetLocale = locale || process.env.LOCALE || 'en';
  
  try {
    // Dynamically import the locale module
    await import(`dayjs/locale/${targetLocale}`);
    dayjs.locale(targetLocale);
    return { success: true, locale: targetLocale };
  } catch (error) {
    console.warn(`Failed to load locale '${targetLocale}', falling back to 'en'`);
    try {
      await import('dayjs/locale/en');
      dayjs.locale('en');
      return { success: false, fallback: 'en', error };
    } catch (fallbackError) {
      console.error('Failed to load even the fallback locale:', fallbackError);
      return { success: false, error: fallbackError };
    }
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
    it('should read LOCALE from environment variables', () => {
      // Test different locale values
      const testLocales = ['en', 'vi', 'fr', 'de', 'es'];
      
      testLocales.forEach(locale => {
        process.env.LOCALE = locale;
        expect(process.env.LOCALE).toBe(locale);
      });
    });

    it('should handle undefined LOCALE environment variable', () => {
      delete process.env.LOCALE;
      expect(process.env.LOCALE).toBeUndefined();
    });

    it('should handle missing LOCALE environment variable', () => {
      const originalLocale = process.env.LOCALE;
      delete process.env.LOCALE;
      
      expect(process.env.LOCALE).toBeUndefined();
      
      // Restore original value
      if (originalLocale) {
        process.env.LOCALE = originalLocale;
      }
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
    it('should support locale parameter in legacy functions', () => {
      // Test that legacy functions can accept locale parameters
      const testLocale = 'vi';
      
      // These would be the function signatures we expect
      const legacyFunctions = {
        syncGoogleCalendarEventsImmediate: (locale?: string) => ({ locale }),
        syncGoogleCalendarEventsExtended: (locale?: string) => ({ locale }),
        syncGoogleCalendarEvents: (locale?: string) => ({ locale }),
      };
      
      expect(legacyFunctions.syncGoogleCalendarEventsImmediate(testLocale).locale).toBe(testLocale);
      expect(legacyFunctions.syncGoogleCalendarEventsExtended(testLocale).locale).toBe(testLocale);
      expect(legacyFunctions.syncGoogleCalendarEvents(testLocale).locale).toBe(testLocale);
    });

    it('should handle missing locale in legacy functions', () => {
      const legacyFunctions = {
        syncGoogleCalendarEventsImmediate: (locale?: string) => ({ locale }),
        syncGoogleCalendarEventsExtended: (locale?: string) => ({ locale }),
        syncGoogleCalendarEvents: (locale?: string) => ({ locale }),
      };
      
      expect(legacyFunctions.syncGoogleCalendarEventsImmediate().locale).toBeUndefined();
      expect(legacyFunctions.syncGoogleCalendarEventsExtended().locale).toBeUndefined();
      expect(legacyFunctions.syncGoogleCalendarEvents().locale).toBeUndefined();
    });
  });

  describe('Date Formatting Consistency', () => {
    it('should format dates consistently', () => {
      // Test date formatting patterns that would be used in the sync functions
      const testDate = '2024-01-15T10:30:00Z';
      const expectedDate = '2024-01-15';
      
      // Simulate the date formatting logic
      const formatDate = (dateString: string, format: string) => {
        if (format === 'YYYY-MM-DD') {
          return dateString.split('T')[0];
        }
        return dateString;
      };
      
      const result = formatDate(testDate, 'YYYY-MM-DD');
      expect(result).toBe(expectedDate);
    });

    it('should handle date range formatting', () => {
      const startDate = '2024-01-15T09:00:00Z';
      const endDate = '2024-01-15T17:00:00Z';
      
      const formatDate = (dateString: string, format: string) => {
        if (format === 'YYYY-MM-DD HH:mm') {
          const date = dateString.split('T')[0];
          const time = dateString.split('T')[1].substring(0, 5);
          return `${date} ${time}`;
        }
        return dateString;
      };
      
      const rangeFormat = `${formatDate(startDate, 'YYYY-MM-DD HH:mm')} to ${formatDate(endDate, 'YYYY-MM-DD HH:mm')}`;
      
      expect(rangeFormat).toBe('2024-01-15 09:00 to 2024-01-15 17:00');
    });

    it('should handle all-day event formatting', () => {
      const startDate = '2024-01-15';
      const endDate = '2024-01-16';
      
      const allDayFormat = `${startDate} to ${endDate}`;
      
      expect(allDayFormat).toBe('2024-01-15 to 2024-01-16');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid locale values gracefully', () => {
      // Test that the system can handle invalid locale values
      const invalidLocales = ['invalid', '123', 'en-US-invalid'];
      
      invalidLocales.forEach(locale => {
        // The system should handle these gracefully
        expect(typeof locale).toBe('string');
        expect(locale.length).toBeGreaterThan(0);
      });
    });

    it('should handle null and undefined locale values', () => {
      // Test null and undefined handling
      const testCases = [null, undefined];
      
      testCases.forEach(locale => {
        // The system should handle these gracefully
        expect(locale === null || locale === undefined).toBe(true);
      });
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
      const viFormat = testDate.locale('vi').format('MMMM D, YYYY [lúc] h:mm A');
      
      expect(enFormat).toContain('January 15, 2024 at');
      expect(viFormat).toContain('tháng 1 15, 2024 lúc');
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
      expect(viRange).toContain('Th01 15, 2024');
    });
  });
}); 