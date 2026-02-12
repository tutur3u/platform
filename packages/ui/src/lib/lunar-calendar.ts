import { getLunarDate as vnGetLunarDate } from '@dqcai/vn-lunar';

export interface LunarDateInfo {
  day: number;
  month: number;
  year: number;
  isLeapMonth: boolean;
}

/**
 * Convert a solar (Gregorian) date to Vietnamese lunar date
 */
export function getLunarDate(solarDate: Date): LunarDateInfo {
  const d = solarDate.getDate();
  const m = solarDate.getMonth() + 1; // JS months are 0-indexed
  const y = solarDate.getFullYear();
  const lunar = vnGetLunarDate(d, m, y);
  return {
    day: lunar.day,
    month: lunar.month,
    year: lunar.year,
    isLeapMonth: lunar.leap,
  };
}

/**
 * Format a lunar date for compact display in calendar cells.
 * Always shows "day/month" (e.g., "15/8") so users can tell which
 * lunar month they're in at a glance.
 */
export function formatLunarDay(lunar: LunarDateInfo): string {
  return `${lunar.day}/${lunar.month}`;
}

/**
 * Check if the lunar date is a special date (Mùng 1 or Rằm)
 */
export function isSpecialLunarDate(lunar: LunarDateInfo): boolean {
  return lunar.day === 1 || lunar.day === 15;
}

interface LunarHoliday {
  en: string;
  vi: string;
}

const LUNAR_HOLIDAYS: Record<string, LunarHoliday> = {
  '1/1': { en: 'Lunar New Year', vi: 'Tết Nguyên Đán' },
  '2/1': { en: "New Year's 2nd Day", vi: 'Mùng 2 Tết' },
  '3/1': { en: "New Year's 3rd Day", vi: 'Mùng 3 Tết' },
  '15/1': { en: 'Lantern Festival', vi: 'Tết Nguyên Tiêu' },
  '3/3': { en: 'Cold Food Festival', vi: 'Tết Hàn Thực' },
  '10/3': { en: "Hung Kings' Day", vi: 'Giỗ Tổ Hùng Vương' },
  '5/5': { en: 'Dragon Boat Festival', vi: 'Tết Đoan Ngọ' },
  '15/7': { en: 'Ghost Festival', vi: 'Vu Lan' },
  '15/8': { en: 'Mid-Autumn Festival', vi: 'Trung Thu' },
  '23/12': { en: 'Kitchen Gods', vi: 'Ông Táo' },
};

/**
 * Get the lunar holiday name for a given lunar date, if any
 */
export function getLunarHolidayName(
  lunar: LunarDateInfo,
  locale: string
): string | null {
  const key = `${lunar.day}/${lunar.month}`;
  const holiday = LUNAR_HOLIDAYS[key];
  if (!holiday) return null;
  return locale.startsWith('vi') ? holiday.vi : holiday.en;
}
