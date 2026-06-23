import type { VietnameseHoliday } from '@tuturuuu/types/primitives';

export type HolidaysActionResult =
  | {
      imported?: number;
      message?: string;
      ok: true;
      yearsAffected?: number[];
    }
  | {
      code?: string;
      message: string;
      ok: false;
      status?: number;
    };

export type HolidayWriteValues = {
  date: string;
  name: string;
};

export type HolidayUpdateValues = Partial<HolidayWriteValues>;

export type HolidayBulkImportValues = {
  holidays: HolidayWriteValues[];
  replaceExisting?: boolean;
};

export type HolidayManagementRow = VietnameseHoliday;

export type HolidayFormValues = HolidayWriteValues;
