import Papa from 'papaparse';
import { BaseCrawler } from './base-crawler';

interface CsvCrawlerProps {
  url: string;
  headerRow?: number;
  dataStartRow?: number;
  // eslint-disable-next-line no-unused-vars
  onProgress: (progress: number, status: string) => void;
}

interface SheetInfo {
  name: string;
  rows: number;
  columns: number;
}

export class CsvCrawler extends BaseCrawler {
  constructor(
    options: { useProductionProxy: boolean } = { useProductionProxy: true }
  ) {
    super({ useProductionProxy: options.useProductionProxy });
    this.useProductionProxy = options.useProductionProxy;
  }

  private async fetchCsvFile(url: string): Promise<string> {
    const response = await this.fetchWithProxy(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV file: ${response.statusText}`);
    }
    return response.text();
  }

  private cleanupData(
    data: (string | number | null | undefined)[][]
  ): (string | number | null | undefined)[][] {
    // Remove empty rows (all cells are null, undefined, or empty string)
    const nonEmptyRows = data.filter((row) =>
      row.some(
        (cell) =>
          cell !== null && cell !== undefined && cell.toString().trim() !== ''
      )
    );

    if (nonEmptyRows.length === 0) return [];

    // Find the last non-empty column index
    const maxColIndex = Math.max(
      ...nonEmptyRows.map((row) => {
        let lastNonEmptyIndex = -1;
        for (let i = row.length - 1; i >= 0; i--) {
          const cell = row[i];
          if (
            cell !== null &&
            cell !== undefined &&
            cell.toString().trim() !== ''
          ) {
            lastNonEmptyIndex = i;
            break;
          }
        }
        return lastNonEmptyIndex;
      })
    );

    // Trim rows to remove empty trailing columns
    return nonEmptyRows.map((row) =>
      row.slice(0, maxColIndex + 1).map((cell) => {
        if (cell === null || cell === undefined) return '';

        const trimmed = cell.toString().trim();

        // Try to preserve numbers, but only if they're purely numeric
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
          const num = Number(trimmed);
          if (!Number.isNaN(num)) {
            return num;
          }
        }

        return trimmed;
      })
    );
  }

  private cleanupHeaders(
    headers: (string | number | null | undefined)[]
  ): string[] {
    if (!headers || headers.length === 0) return [];

    return headers.map((header, index) => {
      const cleaned = header?.toString().trim() || '';
      return cleaned || `Column ${index + 1}`;
    });
  }

  async preloadFile(url: string): Promise<{
    data: (string | number | null | undefined)[][];
    sheetInfo: SheetInfo;
  }> {
    const csvText = await this.fetchCsvFile(url);
    const parsedData = Papa.parse(csvText, {
      delimiter: '\t', // Use tab as delimiter
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
      transform: (value) => {
        if (value === null || value === undefined || value.trim() === '')
          return '';

        const trimmed = value.trim();

        // Try to preserve numbers, but only if they're purely numeric
        if (/^\d+(\.\d+)?$/.test(trimmed)) {
          const num = Number(trimmed);
          if (!Number.isNaN(num)) {
            return num;
          }
        }

        return trimmed;
      },
    });

    if (parsedData.errors?.length > 0 && parsedData.errors[0]?.message) {
      throw new Error(
        `Error parsing CSV file: ${parsedData.errors[0].message}`
      );
    }

    const data = parsedData.data as (string | number | null | undefined)[][];

    return {
      data,
      sheetInfo: {
        name: 'CSV Data',
        rows: data.length,
        columns: data[0]?.length || 0,
      },
    };
  }

  getPreviewFromData(
    data: (string | number | null | undefined)[][],
    headerRow: number,
    dataStartRow: number
  ): {
    headers: string[];
    preview: (string | number | null | undefined)[][];
    error?: string;
  } {
    try {
      if (!data || data.length === 0) {
        return {
          headers: [],
          preview: [],
          error: 'No data found in CSV file',
        };
      }

      // Clean up the data first
      const cleanData = this.cleanupData(data);

      if (cleanData.length === 0) {
        return {
          headers: [],
          preview: [],
          error: 'No valid data found after cleanup',
        };
      }

      if (headerRow === 0) {
        return {
          headers: [],
          preview: [],
          error: 'Header row cannot be 0',
        };
      }

      // Get and clean headers
      const headers =
        headerRow > 0 && cleanData[headerRow - 1]
          ? this.cleanupHeaders(cleanData[headerRow - 1] as any[])
          : Array.from(
              { length: cleanData[0]?.length || 0 },
              (_, i) => `Column ${i + 1}`
            );

      // Get preview rows starting from dataStartRow
      const startIndex = dataStartRow - 1;
      const previewData = cleanData.slice(startIndex, startIndex + 10);

      return {
        headers,
        preview: previewData,
        error: undefined,
      };
    } catch (error) {
      return {
        headers: [],
        preview: [],
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error processing CSV file',
      };
    }
  }

  async crawl({
    url,
    headerRow = 1,
    dataStartRow = 2,
    onProgress,
  }: CsvCrawlerProps): Promise<{
    headers: string[];
    data: (string | number | null | undefined)[][];
    sheetInfo: SheetInfo;
  }> {
    try {
      onProgress(10, 'Fetching CSV file...');
      const csvText = await this.fetchCsvFile(url);

      onProgress(30, 'Parsing CSV data...');
      const parsedData = Papa.parse(csvText, {
        delimiter: '\t', // Use tab as delimiter
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.trim(),
        transform: (value) => {
          if (value === null || value === undefined || value.trim() === '')
            return '';

          const trimmed = value.trim();

          // Try to preserve numbers, but only if they're purely numeric
          if (/^\d+(\.\d+)?$/.test(trimmed)) {
            const num = Number(trimmed);
            if (!Number.isNaN(num)) {
              return num;
            }
          }

          return trimmed;
        },
      });

      if (parsedData.errors?.length > 0 && parsedData.errors[0]?.message) {
        throw new Error(
          `Error parsing CSV file: ${parsedData.errors[0].message}`
        );
      }

      const rawData = parsedData.data as any[][];

      onProgress(50, 'Processing data...');
      onProgress(70, 'Extracting data...');

      // Clean up the data
      const cleanData = this.cleanupData(rawData);

      if (cleanData.length === 0) {
        throw new Error('No valid data found after cleanup');
      }

      if (headerRow === 0) {
        throw new Error('Header row cannot be 0');
      }

      // Get and clean headers
      const headers = this.cleanupHeaders(
        headerRow > 0 && cleanData[headerRow - 1]
          ? (cleanData[headerRow - 1] as any[])
          : Array.from(
              { length: cleanData[0]?.length || 0 },
              (_, i) => `Column ${i + 1}`
            )
      );

      const dataRows = cleanData.slice(dataStartRow - 1);

      onProgress(100, 'Data processing complete');

      return {
        headers,
        data: dataRows,
        sheetInfo: {
          name: 'CSV Data',
          rows: cleanData.length,
          columns: headers.length,
        },
      };
    } catch (error) {
      console.error('CSV crawling error:', error);
      throw error;
    }
  }

  async getPreview(props: CsvCrawlerProps): Promise<{
    headers: string[];
    sampleData: (string | number | null | undefined)[][];
    sheetInfo: SheetInfo;
  }> {
    const { headers, data, sheetInfo } = await this.crawl(props);
    const sampleData: (string | number | null | undefined)[][] = data.slice(
      0,
      5
    );
    return { headers, sampleData, sheetInfo };
  }
}
