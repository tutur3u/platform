import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CsvCrawler } from '../app/[locale]/(dashboard)/[wsId]/(ai)/datasets/[datasetId]/explore/crawlers/csv-crawler';

describe('CsvCrawler', () => {
  let crawler: CsvCrawler;

  beforeEach(() => {
    crawler = new CsvCrawler();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('preloadFile processes CSV data correctly', async () => {
    const mockCsvData = 'Header1\tHeader2\nValue1\tValue2\nValue3\tValue4';

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCsvData),
    });

    const result = await crawler.preloadFile('http://test.com/data.csv');

    expect(result.data).toHaveLength(3);
    expect(result.sheetInfo.columns).toBe(2);
    expect(result.sheetInfo.rows).toBe(3);
  });

  test('getPreviewFromData handles header and data rows correctly', () => {
    const mockData = [
      ['Header1', 'Header2'],
      ['Value1', 'Value2'],
      ['Value3', 'Value4'],
    ];

    const result = crawler.getPreviewFromData(mockData, 1, 2);

    expect(result.headers).toEqual(['Header1', 'Header2']);
    expect(result.preview).toHaveLength(2);
    expect(result.error).toBeUndefined();
  });

  test('crawl processes full dataset correctly', async () => {
    const mockCsvData = 'Header1\tHeader2\nValue1\tValue2\nValue3\tValue4';

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCsvData),
    });

    const result = await crawler.crawl({
      url: 'http://test.com/data.csv',
      headerRow: 1,
      dataStartRow: 2,
      onProgress: vi.fn(),
    });

    expect(result.headers).toEqual(['Header1', 'Header2']);
    expect(result.data).toHaveLength(2);
    expect(result.sheetInfo.columns).toBe(2);
  });

  test('handles empty or invalid CSV data', async () => {
    const mockEmptyCsv = '\n\n';

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockEmptyCsv),
    });

    await expect(
      crawler.crawl({
        url: 'http://test.com/empty.csv',
        headerRow: 1,
        dataStartRow: 2,
        onProgress: vi.fn(),
      })
    ).rejects.toThrow();
  });

  test('converts numeric strings to numbers', async () => {
    const mockCsvData = 'Header1\tHeader2\n123\t456.78\nabc\t789';

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(mockCsvData),
    });

    const result = await crawler.crawl({
      url: 'http://test.com/data.csv',
      headerRow: 1,
      dataStartRow: 2,
      onProgress: vi.fn(),
    });

    expect(typeof result.data[0]?.[0]).toBe('number');
    expect(typeof result.data[0]?.[1]).toBe('number');
    expect(typeof result.data[1]?.[0]).toBe('string');
  });
});
