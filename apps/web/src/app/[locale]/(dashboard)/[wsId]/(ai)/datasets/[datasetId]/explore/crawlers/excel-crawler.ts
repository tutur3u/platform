import * as XLSX from 'xlsx';

interface ExcelCrawlerProps {
  url: string;
  headerRow?: number;
  dataStartRow: number;
  // eslint-disable-next-line no-unused-vars
  onProgress: (progress: number, status: string) => void;
}

interface SheetInfo {
  name: string;
  rows: number;
  columns: number;
}

export class ExcelCrawler {
  private async fetchExcelFile(url: string): Promise<ArrayBuffer> {
    const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch Excel file: ${response.statusText}`);
    }
    return response.arrayBuffer();
  }

  private findRelevantSheet(workbook: XLSX.WorkBook): string | undefined {
    return (
      workbook.SheetNames.find(
        (name) =>
          name.toLowerCase().includes('monthly') ||
          name.toLowerCase().includes('price')
      ) || workbook.SheetNames[0]
    );
  }

  private processHeaders(
    worksheet: XLSX.WorkSheet,
    headerRow?: number
  ): string[] {
    if (!headerRow) {
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      return Array.from({ length: range.e.c + 1 }, (_, i) => `Column ${i + 1}`);
    }

    const headers = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
    })[headerRow - 1] as string[];

    return headers.map((header, index) =>
      header ? header.toString() : `Column ${index + 1}`
    );
  }

  private validateData(data: any[][]): void {
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Invalid Excel data format');
    }

    const columnCount = data[0]?.length;
    const invalidRows = data.filter((row) => row.length !== columnCount);
    if (invalidRows.length > 0) {
      throw new Error('Inconsistent column count in Excel data');
    }
  }

  async preloadFile(url: string): Promise<{
    workbook: XLSX.WorkBook;
    sheetInfo: SheetInfo;
  }> {
    const arrayBuffer = await this.fetchExcelFile(url);
    const workbook = XLSX.read(arrayBuffer);
    const sheetName = this.findRelevantSheet(workbook);

    if (!sheetName || !workbook.Sheets[sheetName]) {
      throw new Error('No valid worksheet found');
    }

    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    return {
      workbook,
      sheetInfo: {
        name: sheetName,
        rows: range.e.r + 1,
        columns: range.e.c + 1,
      },
    };
  }

  getPreviewFromWorkbook(
    workbook: XLSX.WorkBook,
    sheetName: string,
    headerRow: number,
    dataStartRow: number
  ): { headers: string[]; preview: any[][]; error?: string } {
    try {
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        return {
          headers: [],
          preview: [],
          error: 'No valid worksheet found',
        };
      }

      const allData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as any[][];

      // Get headers
      const headers =
        headerRow > 0 && allData[headerRow - 1]
          ? allData[headerRow - 1]
          : Array.from(
              { length: allData[0]?.length || 0 },
              (_, i) => `Column ${i + 1}`
            );

      // Get preview rows
      const previewData = allData.slice(dataStartRow - 1, dataStartRow + 9);

      // Validate column consistency
      const columnCount = headers?.length || 0;
      const invalidRows = previewData.filter(
        (row) => row.length !== columnCount
      );

      if (invalidRows.length > 0) {
        return {
          headers: headers || [],
          preview: previewData,
          error: `Inconsistent column count. Expected ${columnCount} columns but found rows with different counts.`,
        };
      }

      return { headers: headers || [], preview: previewData };
    } catch (error) {
      return {
        headers: [],
        preview: [],
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error processing Excel file',
      };
    }
  }

  async crawl({
    url,
    headerRow,
    dataStartRow,
    onProgress,
  }: ExcelCrawlerProps): Promise<{
    headers: string[];
    data: any[][];
    sheetInfo: SheetInfo;
  }> {
    try {
      onProgress(10, 'Fetching Excel file...');
      const arrayBuffer = await this.fetchExcelFile(url);

      onProgress(30, 'Parsing Excel data...');
      const workbook = XLSX.read(arrayBuffer);
      const sheetName = this.findRelevantSheet(workbook);

      if (!sheetName) {
        throw new Error('No valid sheet found');
      }

      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) {
        throw new Error('No valid worksheet found');
      }

      onProgress(50, 'Processing worksheet...');
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      const sheetInfo: SheetInfo = {
        name: sheetName,
        rows: range.e.r + 1,
        columns: range.e.c + 1,
      };

      onProgress(70, 'Extracting data...');
      const excelData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as any[][];

      this.validateData(excelData);

      const headers = this.processHeaders(worksheet, headerRow);
      const dataRows = excelData.slice(dataStartRow - 1);

      onProgress(90, 'Finalizing data...');
      const processedData = dataRows.map((row) =>
        row.map((cell: any) =>
          cell !== null && cell !== undefined ? cell.toString() : ''
        )
      );

      onProgress(100, 'Data processing complete');

      return {
        headers,
        data: processedData,
        sheetInfo,
      };
    } catch (error) {
      console.error('Excel crawling error:', error);
      throw error;
    }
  }

  async getPreview(props: ExcelCrawlerProps): Promise<{
    headers: string[];
    sampleData: any[][];
    sheetInfo: SheetInfo;
  }> {
    const { headers, data, sheetInfo } = await this.crawl(props);
    const sampleData = data.slice(0, 5); // Get first 5 rows for preview
    return { headers, sampleData, sheetInfo };
  }
}
