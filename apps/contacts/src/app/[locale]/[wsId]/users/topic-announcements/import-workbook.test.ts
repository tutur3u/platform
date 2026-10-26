import { describe, expect, it, vi } from 'vitest';

const xlsx = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@tuturuuu/ui/xlsx', () => ({
  XLSX: { read: xlsx.read, utils: {} },
}));

import {
  ImportWorkbookTooLargeError,
  MAX_IMPORT_WORKBOOK_BYTES,
  parseImportWorkbook,
} from './import-workbook';

describe('parseImportWorkbook', () => {
  it('refuses a file over the size cap before reading it', async () => {
    const file = new File(
      [new Uint8Array(MAX_IMPORT_WORKBOOK_BYTES + 1)],
      'schedule.xlsx'
    );
    await expect(parseImportWorkbook(file, 30)).rejects.toBeInstanceOf(
      ImportWorkbookTooLargeError
    );
    expect(xlsx.read).not.toHaveBeenCalled();
  });
});
