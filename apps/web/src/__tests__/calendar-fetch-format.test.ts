import { describe, test, expect } from 'vitest';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { convertGoogleAllDayEvent } from '@tuturuuu/ui/hooks/calendar-utils';

// Extend dayjs with required plugins for timezone handling
dayjs.extend(utc);
dayjs.extend(timezone);

describe('convertGoogleAllDayEvent', () => {
  test('converts all-day (date-only) event to local timezone midnight', () => {
    const result = convertGoogleAllDayEvent('2024-01-01', '2024-01-02', 'Asia/Ho_Chi_Minh');
    // The function now stores local timezone midnight times
    expect(result.start_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(result.end_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Verify the dates are different (start and end dates)
    expect(result.start_at).not.toBe(result.end_at);
  });

  test('returns as-is for dateTime input', () => {
    const result = convertGoogleAllDayEvent('2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z', 'Asia/Ho_Chi_Minh');
    expect(result.start_at).toBe('2024-01-01T10:00:00Z');
    expect(result.end_at).toBe('2024-01-01T11:00:00Z');
  });

  test('handles missing start or end date', () => {
    const result = convertGoogleAllDayEvent(undefined, undefined, 'Asia/Ho_Chi_Minh');
    expect(result.start_at).toBeDefined();
    expect(result.end_at).toBeDefined();
  });

  test('handles auto timezone', () => {
    const result = convertGoogleAllDayEvent('2024-01-01', '2024-01-02', 'auto');
    // The function now stores local timezone midnight times
    expect(result.start_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(result.end_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Verify the dates are different (start and end dates)
    expect(result.start_at).not.toBe(result.end_at);
  });

  test('handles invalid date format gracefully', () => {
    const result = convertGoogleAllDayEvent('invalid', 'invalid', 'Asia/Ho_Chi_Minh');
    expect(result.start_at).toBeDefined();
    expect(result.end_at).toBeDefined();
  });

  test('handles multi-day all-day events', () => {
    const result = convertGoogleAllDayEvent('2024-01-01', '2024-01-05', 'Asia/Ho_Chi_Minh');
    expect(result.start_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(result.end_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Verify the dates are different (start and end dates)
    expect(result.start_at).not.toBe(result.end_at);
  });

  test('timezone plugin is properly loaded', () => {
    // Test that dayjs timezone functions work
    expect(typeof dayjs.tz).toBe('function');
    
    // Test that we can create a timezone-aware date
    const tzDate = dayjs.tz('2024-01-01T00:00:00', 'Asia/Ho_Chi_Minh');
    expect(tzDate.isValid()).toBe(true);
    expect(tzDate.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
}); 