import { CsvCrawler } from '../app/[locale]/(dashboard)/[wsId]/(ai)/datasets/[datasetId]/explore/crawlers/csv-crawler';
import { ExcelCrawler } from '../app/[locale]/(dashboard)/[wsId]/(ai)/datasets/[datasetId]/explore/crawlers/excel-crawler';
import { HtmlCrawler } from '../app/[locale]/(dashboard)/[wsId]/(ai)/datasets/[datasetId]/explore/crawlers/html-crawler';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const SECONDS = 1000;

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('VBMA CSV Data', () => {
    test('crawls VBMA macroeconomic data correctly', async () => {
      const crawler = new CsvCrawler();
      const url =
        'https://vbma.org.vn/csv/markets/tables/vi/tong_quan_kinh_te_vi_mo.csv';

      const result = await crawler.crawl({
        url,
        onProgress: vi.fn(),
      });

      // Verify we have valid data
      expect(result.headers.length).toBeGreaterThan(0);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]?.length).toBe(result.headers.length);

      // Verify expected column headers exist
      expect(result.headers).toContain('-');
      expect(result.headers.some((h) => h.includes('T1 2017'))).toBe(true);

      // Verify data types
      expect(typeof result.data[0]?.[0]).toBe('string');
      expect(typeof result.data[0]?.[1]).toBe('string');
    });
  });

  describe('World Bank Excel Data', () => {
    test('crawls World Bank commodity data correctly', async () => {
      const crawler = new ExcelCrawler();
      const url =
        'https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx';

      const result = await crawler.crawl({
        url,
        headerRow: 5,
        dataStartRow: 7,
        onProgress: vi.fn(),
      });

      // Verify we have valid data
      expect(result.headers.length).toBeGreaterThan(0);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]?.length).toBe(result.headers.length);

      // Verify data structure
      const firstRow = result.data[0];
      expect(firstRow).toBeDefined();

      // Date should be in first column
      expect(typeof firstRow?.[0]).toBe('string');
      const dateRegex = /^\d{4}[A-Z][0-9]{2}$/; // Format like "2024M01"
      expect(dateRegex.test(firstRow?.[0])).toBe(true);

      // All other columns should be string
      for (let i = 1; i < (firstRow?.length || 0); i++) {
        expect(typeof firstRow?.[i]).toBe('string');
      }
    });
  });

  describe(
    'Agro Gov HTML Data',
    () => {
      test('crawls Agro Gov rice data correctly', async () => {
        const crawler = new HtmlCrawler();
        const url = 'https://agro.gov.vn/vn/xc9_Lua-gao.html';
        const maxArticles = 11;

        const result = await crawler.crawl({
          url,
          htmlIds: [
            '{{TITLE}}:.news[]->a{href}->#ctl00_maincontent_N_TIEUDE',
            '{{CONTENT}}:.news[]->a{href}->#ctl00_maincontent_N_NOIDUNG',
            '{{DATE}}:.news[]->a{href}->#ctl00_maincontent_N_NGAYTHANG',
            '{{URL}}:.news[]->a{href}',
          ],
          maxArticles,
          onProgress: vi.fn(),
        });

        // Verify we have results
        expect(result.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThanOrEqual(maxArticles);

        // Check structure of first article
        const firstArticle = result[0];
        expect(firstArticle).toBeDefined();
        expect(firstArticle).toHaveProperty('TITLE');
        expect(firstArticle).toHaveProperty('CONTENT');
        expect(firstArticle).toHaveProperty('DATE');
        expect(firstArticle).toHaveProperty('URL');

        // Validate URL format
        expect(firstArticle.URL).toMatch(/^https?:\/\//);

        const [day, month, year] =
          firstArticle.DATE?.replace(/\s/g, '')?.split('|') || [];

        expect(day).toBeDefined();
        expect(month).toBeDefined();
        expect(year).toBeDefined();

        // Validate date format (should be a valid date string)
        // Date from Agro Gov looks like 01 | 01 | 2025
        const dateObj = new Date(`${year}-${month}-${day}`);

        expect(dateObj.toString()).not.toBe('Invalid Date');

        // Title and content should not be empty
        expect(firstArticle.TITLE.length).toBeGreaterThan(0);
        expect(firstArticle.CONTENT.length).toBeGreaterThan(0);
      });
    },
    100 * SECONDS
  );
});
