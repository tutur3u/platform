import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { ExcelCrawler } from '../app/[locale]/(dashboard)/[wsId]/(ai)/datasets/[datasetId]/explore/crawlers/excel-crawler';

describe('ExcelCrawler', () => {
  let crawler: ExcelCrawler;

  beforeEach(() => {
    crawler = new ExcelCrawler();
    vi.clearAllMocks();

    // Mock fetch for all tests
    global.fetch = vi.fn();
  });

  // Helper function to create a mock Excel file
  const createMockExcelFile = (
    data: (string | number | null | undefined)[][]
  ): ArrayBuffer => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'array' }) as ArrayBuffer;
  };

  test('getPreview fetches and parses Excel correctly', async () => {
    const mockData = [
      ['Header1', 'Header2', 'Header3'],
      ['Data1', 'Data2', 'Data3'],
      ['Data4', 'Data5', 'Data6'],
    ];

    const mockExcelFile = createMockExcelFile(mockData);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockExcelFile),
      })
    );

    const result = await crawler.getPreview({
      url: 'https://test.com/data.xlsx',
      headerRow: 1,
      dataStartRow: 2,
      onProgress: vi.fn(),
    });

    expect(result).toBeDefined();
    expect(result.headers).toEqual(['Header1', 'Header2', 'Header3']);
    expect(result.sampleData).toHaveLength(2);
    expect(result.sheetInfo).toEqual({
      name: 'Sheet1',
      rows: 3,
      columns: 3,
    });
  });

  test('handles invalid Excel files', async () => {
    // Create a mock invalid Excel file with a PNG header
    const mockInvalidData = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG header
      0x00,
      0x00,
      0x00,
      0x0d, // Invalid data
    ]);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockInvalidData.buffer),
      })
    );

    await expect(
      crawler.getPreview({
        url: 'https://test.com/invalid.xlsx',
        headerRow: 1,
        dataStartRow: 2,
        onProgress: vi.fn(),
      })
    ).rejects.toThrow('Unsupported Excel file');
  });

  test('handles fetch errors gracefully', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: false,
        statusText: 'Not Found',
      })
    );

    await expect(
      crawler.getPreview({
        url: 'https://test.com/notfound.xlsx',
        headerRow: 1,
        dataStartRow: 2,
        onProgress: vi.fn(),
      })
    ).rejects.toThrow('Failed to fetch Excel file: Not Found');
  });

  test('handles empty Excel files', async () => {
    const mockEmptyData = createMockExcelFile([[]]);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockEmptyData),
      })
    );

    await expect(
      crawler.crawl({
        url: 'https://test.com/empty.xlsx',
        headerRow: 1,
        dataStartRow: 2,
        onProgress: vi.fn(),
      })
    ).rejects.toThrow('No valid data found after cleanup');
  });

  test('validates header row and data start row', async () => {
    const mockData = [
      ['Header1', 'Header2', 'Header3'],
      ['Data1', 'Data2', 'Data3'],
    ];

    const mockExcelFile = createMockExcelFile(mockData);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockExcelFile),
      })
    );

    await expect(
      crawler.crawl({
        url: 'https://test.com/data.xlsx',
        headerRow: 0,
        dataStartRow: 2,
        onProgress: vi.fn(),
      })
    ).rejects.toThrow('Header row cannot be 0');
  });

  test('reports progress correctly', async () => {
    const mockData = [
      ['Header1', 'Header2'],
      ['Data1', 'Data2'],
    ];

    const mockExcelFile = createMockExcelFile(mockData);
    const onProgress = vi.fn();

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockExcelFile),
      })
    );

    await crawler.crawl({
      url: 'https://test.com/data.xlsx',
      headerRow: 1,
      dataStartRow: 2,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(10, 'Fetching Excel file...');
    expect(onProgress).toHaveBeenCalledWith(30, 'Parsing Excel data...');
    expect(onProgress).toHaveBeenCalledWith(50, 'Processing worksheet...');
    expect(onProgress).toHaveBeenCalledWith(70, 'Extracting data...');
    expect(onProgress).toHaveBeenCalledWith(100, 'Data processing complete');
  });

  test('handles network errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.reject(new Error('Network error'))
    );

    await expect(
      crawler.getPreview({
        url: 'https://test.com/data.xlsx',
        headerRow: 1,
        dataStartRow: 2,
        onProgress: vi.fn(),
      })
    ).rejects.toThrow('Network error');
  });

  test('cleans up data correctly', async () => {
    const mockData = [
      ['Header1', 'Header2', ''],
      ['Data1', 'Data2', null],
      ['', '', ''],
      ['Data3', 'Data4', undefined],
    ];

    const mockExcelFile = createMockExcelFile(mockData);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockExcelFile),
      })
    );

    const result = await crawler.getPreview({
      url: 'https://test.com/data.xlsx',
      headerRow: 1,
      dataStartRow: 2,
      onProgress: vi.fn(),
    });

    expect(result.headers).toEqual(['Header1', 'Header2']);
    expect(result.sampleData).toHaveLength(2);
    expect(result.sampleData[0]).toEqual(['Data1', 'Data2']);
    expect(result.sampleData[1]).toEqual(['Data3', 'Data4']);
  });
});
