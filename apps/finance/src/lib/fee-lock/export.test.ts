import { XLSX } from '@tuturuuu/ui/xlsx';
import { describe, expect, it } from 'vitest';
import {
  buildFeeLockExportSheets,
  type FeeLockExportEntry,
} from './export-rows';
import {
  feeLockExportFileName,
  sha256Hex,
  writeFeeLockWorkbook,
} from './export-workbook';

// Synthetic fixtures only.
const line = (over: Partial<FeeLockExportEntry['lines'][number]>) => ({
  kind: 'tuition' as const,
  group_name: 'Lớp A',
  label: 'Học phí Lớp A',
  unit_label: 'buổi',
  unit_price: 100_000,
  quantity: 8,
  adjustment_amount: 0,
  reason: null,
  line_amount: 800_000,
  sort_order: 0,
  ...over,
});
// biome-ignore format: compact fixture
const twoClasses: FeeLockExportEntry = {
  status: 'locked', revision: 2, student_name: 'Học viên Một', period_month: '2026-12-01', total_amount: 1_350_000,
  lines: [
    line({ kind: 'extra', group_name: null, label: 'Sách', unit_label: 'bộ', unit_price: 150_000, quantity: 1, line_amount: 150_000, sort_order: 2 }),
    line({}),
    line({ group_name: 'Lớp B', label: 'Học phí Lớp B', quantity: 5, adjustment_amount: -100_000, reason: 'Thành tích', line_amount: 400_000, sort_order: 1 }),
  ],
};
const draft: FeeLockExportEntry = {
  status: 'draft',
  revision: null,
  student_name: '=HYPERLINK("https://evil.test","x")',
  period_month: '2026-12-01',
  total_amount: 800_000,
  lines: [line({ reason: '+cmd' })],
};

describe('buildFeeLockExportSheets', () => {
  it('writes ONE summary row per student, aggregating every class and extra', () => {
    const { summary, detail } = buildFeeLockExportSheets([twoClasses, draft]);
    expect(summary).toHaveLength(3);
    // biome-ignore format: one expected row
    expect(summary[1]).toEqual([
      1, 'Học viên Một', 'Lớp A, Lớp B', '12/2026', 13, 1_300_000, -100_000,
      'Lớp B: Thành tích', 'Sách × 1 bộ', 150_000, 1_350_000, 'Đã chốt', 2,
    ]);
    expect(summary[2]?.slice(-2)).toEqual(['Bản nháp', null]);
    expect(detail).toHaveLength(1 + 3 + 1);
    expect(detail.slice(1, 4).map((row) => row[5])).toEqual([
      'Học phí Lớp A',
      'Học phí Lớp B',
      'Sách',
    ]);
  });

  it('keeps the agreed 13 summary columns and has English headers', () => {
    const vi = buildFeeLockExportSheets([]);
    const en = buildFeeLockExportSheets([], 'en');
    expect(vi.summary[0]).toHaveLength(13);
    expect(vi.summaryName).toBe('Tổng hợp');
    expect(en.summary[0]?.[1]).toBe('Student');
    expect(en.detailName).toBe('Details');
  });
});

describe('writeFeeLockWorkbook', () => {
  const bytes = writeFeeLockWorkbook(
    buildFeeLockExportSheets([twoClasses, draft])
  );
  const book = XLSX.read(bytes, { type: 'array', cellFormula: true });

  it('writes text as guarded string cells and amounts as numbers', () => {
    const sheet = book.Sheets['Tổng hợp'];
    expect(sheet?.B3).toMatchObject({
      t: 's',
      v: `'=HYPERLINK("https://evil.test","x")`,
    });
    expect(sheet?.H3).toMatchObject({ t: 's', v: "'+cmd" });
    expect(sheet?.K2).toMatchObject({ t: 'n', v: 1_350_000 });
    expect(sheet?.M3).toBeUndefined();
  });

  it('contains no formula anywhere', () => {
    for (const name of book.SheetNames) {
      for (const [ref, cell] of Object.entries(book.Sheets[name] ?? {})) {
        if (!ref.startsWith('!'))
          expect((cell as XLSX.CellObject).f).toBeUndefined();
      }
    }
    type Entry = { name: string; content: Uint8Array };
    const zip = XLSX.CFB.read(bytes, { type: 'array' });
    const xml = zip.FileIndex.filter((f: Entry) => f.name.endsWith('.xml'))
      .map((f: Entry) => new TextDecoder().decode(f.content))
      .join('');
    expect(xml).toContain('HYPERLINK');
    expect(xml).not.toMatch(/<f[\s>]/);
  });

  it('hashes the exact bytes', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(await sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
    const ws = '0000000A-0000-4000-8000-0000000fe010';
    expect(feeLockExportFileName('2026-12', ws)).toBe(
      'chot-hoc-phi-2026-12-0000000a.xlsx'
    );
    for (const [month, id] of [
      ['2026-12"; x=.exe', ws],
      ['2026-13', ws],
      ['2026-12', 'personal'],
      ['2026-12', 'Nguyễn Văn A'],
    ]) {
      expect(() => feeLockExportFileName(month ?? '', id ?? '')).toThrow();
    }
  });
});
