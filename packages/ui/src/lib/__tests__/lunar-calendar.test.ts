import { describe, expect, it } from 'vitest';
import {
  formatLunarDay,
  getLunarDate,
  getLunarHolidayName,
  isSpecialLunarDate,
} from '../lunar-calendar';

describe('getLunarDate', () => {
  it('converts a solar date to lunar date', () => {
    // Feb 17, 2026 is Lunar New Year (1/1 Bính Ngọ)
    const lunar = getLunarDate(new Date(2026, 1, 17));
    expect(lunar.day).toBe(1);
    expect(lunar.month).toBe(1);
    expect(lunar.year).toBe(2026);
  });

  it('returns correct structure', () => {
    const lunar = getLunarDate(new Date(2025, 0, 15));
    expect(lunar).toHaveProperty('day');
    expect(lunar).toHaveProperty('month');
    expect(lunar).toHaveProperty('year');
    expect(lunar).toHaveProperty('isLeapMonth');
    expect(typeof lunar.day).toBe('number');
    expect(typeof lunar.isLeapMonth).toBe('boolean');
  });
});

describe('formatLunarDay', () => {
  it('always shows day/month format', () => {
    const result = formatLunarDay({
      day: 1,
      month: 3,
      year: 2025,
      isLeapMonth: false,
    });
    expect(result).toBe('1/3');
  });

  it('shows day/month for Rằm', () => {
    const result = formatLunarDay({
      day: 15,
      month: 8,
      year: 2025,
      isLeapMonth: false,
    });
    expect(result).toBe('15/8');
  });

  it('shows day/month for regular days', () => {
    const result = formatLunarDay({
      day: 7,
      month: 5,
      year: 2025,
      isLeapMonth: false,
    });
    expect(result).toBe('7/5');
  });
});

describe('isSpecialLunarDate', () => {
  it('returns true for Mùng 1 (1st)', () => {
    expect(
      isSpecialLunarDate({ day: 1, month: 5, year: 2025, isLeapMonth: false })
    ).toBe(true);
  });

  it('returns true for Rằm (15th)', () => {
    expect(
      isSpecialLunarDate({ day: 15, month: 8, year: 2025, isLeapMonth: false })
    ).toBe(true);
  });

  it('returns false for regular days', () => {
    expect(
      isSpecialLunarDate({ day: 7, month: 3, year: 2025, isLeapMonth: false })
    ).toBe(false);
  });
});

describe('getLunarHolidayName', () => {
  it('returns Tết for 1/1 in Vietnamese', () => {
    const holiday = getLunarHolidayName(
      { day: 1, month: 1, year: 2025, isLeapMonth: false },
      'vi'
    );
    expect(holiday).toBe('Tết Nguyên Đán');
  });

  it('returns Lunar New Year for 1/1 in English', () => {
    const holiday = getLunarHolidayName(
      { day: 1, month: 1, year: 2025, isLeapMonth: false },
      'en'
    );
    expect(holiday).toBe('Lunar New Year');
  });

  it('returns Mid-Autumn for 15/8 in English', () => {
    const holiday = getLunarHolidayName(
      { day: 15, month: 8, year: 2025, isLeapMonth: false },
      'en'
    );
    expect(holiday).toBe('Mid-Autumn Festival');
  });

  it('returns Trung Thu for 15/8 in Vietnamese', () => {
    const holiday = getLunarHolidayName(
      { day: 15, month: 8, year: 2025, isLeapMonth: false },
      'vi'
    );
    expect(holiday).toBe('Trung Thu');
  });

  it('returns null for non-holiday dates', () => {
    const holiday = getLunarHolidayName(
      { day: 7, month: 3, year: 2025, isLeapMonth: false },
      'en'
    );
    expect(holiday).toBeNull();
  });

  it('returns Vu Lan for 15/7 in Vietnamese', () => {
    const holiday = getLunarHolidayName(
      { day: 15, month: 7, year: 2025, isLeapMonth: false },
      'vi'
    );
    expect(holiday).toBe('Vu Lan');
  });

  it('returns Hung Kings Day for 10/3 in Vietnamese', () => {
    const holiday = getLunarHolidayName(
      { day: 10, month: 3, year: 2025, isLeapMonth: false },
      'vi'
    );
    expect(holiday).toBe('Giỗ Tổ Hùng Vương');
  });
});
