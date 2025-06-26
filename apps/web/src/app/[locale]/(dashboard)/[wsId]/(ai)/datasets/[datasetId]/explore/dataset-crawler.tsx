'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { WorkspaceDataset } from '@tuturuuu/types/db';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Info, RefreshCw } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/use-toast';
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { CsvCrawler } from './crawlers/csv-crawler';
import { ExcelCrawler } from './crawlers/excel-crawler';

const FormSchema = z.object({
  url: z
    .string()
    .url({ message: 'Please enter a valid URL' })
    .regex(/\.(xlsx|xls|csv)$/i, {
      message: 'URL must point to an Excel or CSV file',
    })
    .optional()
    .or(z.string().length(0)),
  headerRow: z.string().min(1, {
    message: 'Header row must be at least 1',
  }),
  dataRow: z.string().min(1, {
    message: 'Data row must be at least 1',
  }),
  sheetName: z.string().min(1, {
    message: 'Sheet name must be at least 1',
  }),
  columnMapping: z.record(z.string(), z.string()),
});

interface ProcessedDataRow {
  [key: string]: string | number | null;
}

interface SheetInfo {
  rows: number;
  columns: number;
  name: string;
}

export function DatasetCrawler({
  wsId,
  dataset,
  children,
}: {
  wsId: string;
  dataset: WorkspaceDataset;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [processedData, setProcessedData] = useState<ProcessedDataRow[][]>([]);
  const [sheetInfo, setSheetInfo] = useState<SheetInfo>({
    rows: 0,
    columns: 0,
    name: '',
  });
  const [, setColumns] = useState<ProcessedDataRow[]>([]);
  const [, setRows] = useState<ProcessedDataRow[]>([]);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState('');
  const [workbook, setWorkbook] = useState<
    XLSX.WorkBook | ProcessedDataRow[][] | null
  >(null);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [isFileLoaded, setIsFileLoaded] = useState(false);
  const [localFile, _setLocalFile] = useState<File | null>(null);
  const [availableSheets, _setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      headerRow: 1,
      dataRow: 2,
      sheetName: '',
      columnMapping: {},
    },
  });

  const loadExcelFile = async (
    e?: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>
  ) => {
    const file =
      e?.target?.files?.[0] || (e as React.DragEvent)?.dataTransfer?.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      let data: ProcessedDataRow[][] | XLSX.WorkBook;

      if (file.name.toLowerCase().endsWith('.csv')) {
        const csvCrawler = new CsvCrawler();
        data = csvCrawler.parseCsvData(arrayBuffer);
        setWorkbook(data);
        setSheetInfo({
          rows: data.length,
          columns: data[0]?.length || 0,
          name: file.name,
        });
        updatePreview(data, file.name, 1, 2);
      } else {
        const excelCrawler = new ExcelCrawler();
        data = excelCrawler.parseExcelData(arrayBuffer);
        setWorkbook(data);
        const sheetNames = Object.keys(data.Sheets);
        const firstSheet = sheetNames[0];
        const sheetData = data.Sheets[firstSheet];
        const range = XLSX.utils.decode_range(sheetData['!ref'] || 'A1');
        setSheetInfo({
          rows: range.e.r + 1,
          columns: range.e.c + 1,
          name: firstSheet,
        });
        form.setValue('sheetName', firstSheet);
        updatePreview(data, firstSheet, 1, 2);
      }
    } catch (error) {
      console.error('Error loading file:', error);
      toast.error('Error loading file');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && dataset.url && !localFile && !workbook) {
      loadExcelFile();
    }
  }, [
    isOpen,
    dataset.url, // Prefetch from URL if available
    form.setValue,
    loadExcelFile,
  ]);

  useEffect(() => {
    const fetchColumnsAndRows = async () => {
      const columnsRes = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/columns`
      );
      if (columnsRes.ok) {
        const cols = await columnsRes.json();
        setColumns(cols);
      }
      const rowsRes = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/rows`
      );
      if (rowsRes.ok) {
        const { data } = await rowsRes.json();
        setRows(data);
      }
    };

    fetchColumnsAndRows();
  }, [wsId, dataset.id]);

  useEffect(() => {
    if (isOpen) {
      setSyncStatus('Ready to import data');
      setSyncProgress(0);
    }
  }, [isOpen]);

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    form.setValue('url', url, { shouldValidate: true });
    setExcelError(null);
  };

  const handleSheetChange = (sheetName: string) => {
    if (!sheetName) return;

    setSelectedSheet(sheetName);
    if (workbook) {
      const headerRow = parseInt(form.getValues('headerRow') || '1');
      const dataRow = parseInt(form.getValues('dataRow') || '2');
      updatePreview(workbook, sheetName, headerRow, dataRow);
    }
  };

  const updatePreview = (
    data: ProcessedDataRow[][] | XLSX.WorkBook,
    sheetName: string,
    headerRow: number,
    dataRow: number
  ) => {
    let preview: ProcessedDataRow[][];
    try {
      if (Array.isArray(data) && data.length > 0 && data[0].length > 0) {
        const csvCrawler = new CsvCrawler();
        preview = csvCrawler.getPreviewFromData(
          data as ProcessedDataRow[][],
          headerRow,
          dataRow
        );
      } else if (data && typeof data === 'object' && 'Sheets' in data) {
        const excelCrawler = new ExcelCrawler();
        preview = excelCrawler.getPreviewFromData(
          data as XLSX.WorkBook,
          sheetName,
          headerRow,
          dataRow
        );
      } else {
        preview = [];
      }

      if (preview.error) {
        setExcelError(preview.error);
        return;
      }

      setExcelError(null);

      // Update sheet info with actual data
      if ('SheetNames' in data) {
        const worksheet = data.Sheets[sheetName];
        if (worksheet?.['!ref']) {
          const range = XLSX.utils.decode_range(worksheet['!ref']);
          setSheetInfo((prev) => ({
            ...prev,
            name: sheetName,
            rows: range.e.r + 1,
            columns: range.e.c + 1,
          }));
        }
      }

      // Ensure we have valid preview data
      if (!preview.headers || !preview.preview) {
        setExcelError('No valid data found with current settings');
        setProcessedData([preview.headers]); // Show headers even if no data
        return;
      }

      // Ensure preview data matches header length
      const headerLength = preview.headers.length;
      const validPreview = preview.preview
        .filter((row) => row && row.length === headerLength)
        .map((row) =>
          row.map((cell) =>
            cell === null || cell === undefined ? '' : String(cell).trim()
          )
        );

      if (validPreview.length === 0) {
        setExcelError('No valid data rows found with current settings');
        setProcessedData([preview.headers]); // Show headers even if no data
        return;
      }

      setProcessedData([preview.headers, ...validPreview]);
    } catch (error) {
      console.error('Error updating preview:', error);
      setExcelError(
        error instanceof Error
          ? error.message
          : 'Failed to update preview with current settings'
      );
      setProcessedData([]);
    }
  };

  const handleConfigChange = () => {
    if (!workbook || !selectedSheet) return;

    const headerRow = parseInt(form.getValues('headerRow') || '1');
    const dataRow = parseInt(form.getValues('dataRow') || '2');

    // Validate row numbers
    if (headerRow < 1) {
      setExcelError('Header row must be at least 1');
      return;
    }

    if (dataRow <= headerRow) {
      setExcelError('Data row must be greater than header row');
      return;
    }

    updatePreview(workbook, selectedSheet, headerRow, dataRow);
  };

  const handleConfirmSync = async () => {
    try {
      setLoading(true);
      setSyncStatus('Starting sync with server...');

      const crawler =
        dataset.url?.toLowerCase().endsWith('.csv') ||
        localFile?.name.toLowerCase().endsWith('.csv')
          ? new CsvCrawler()
          : new ExcelCrawler();

      setSyncStatus('Fetching and parsing file...');
      const { headers, data, sheetInfo } = await crawler.crawl({
        url: dataset.url || '',
        headerRow: parseInt(form.getValues('headerRow') || '1'),
        dataStartRow: parseInt(form.getValues('dataRow') || '2'),
        onProgress: (progress, status) => {
          setSyncProgress(progress);
          setSyncStatus(status);
        },
      });

      setSyncStatus(`Found ${data.length} rows in ${sheetInfo.name}`);

      // Ensure unique column names
      const uniqueHeaders = headers.reduce(
        (acc: string[], header: string, index: number) => {
          const headerName = header.toString().trim() || `Column ${index + 1}`;
          let uniqueName = headerName;
          let counter = 1;

          while (acc.includes(uniqueName)) {
            uniqueName = `${headerName} (${counter})`;
            counter++;
          }

          acc.push(uniqueName);
          return acc;
        },
        []
      );

      // Sync columns first
      setSyncStatus('Syncing columns...');
      const columnsResponse = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/columns/sync`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            columns: uniqueHeaders.map((header) => ({
              name: header,
            })),
          }),
        }
      );

      if (!columnsResponse.ok) {
        throw new Error('Failed to sync columns');
      }

      // Convert and sync data with unique column names
      const rows = data.map((row) => {
        const rowData: Record<string, string | number | null> = {};
        uniqueHeaders.forEach((header, index) => {
          // Preserve the original value type (number, string, etc.)
          rowData[header] = row[index] || null;
        });
        return rowData;
      });

      // Sync rows in batches
      setSyncStatus(`Starting sync of ${rows.length} rows...`);
      const BATCH_SIZE = 100;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const response = await fetch(
          `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/rows/sync`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ rows: batch }),
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to sync batch ${Math.floor(i / BATCH_SIZE) + 1}: ${
              response.statusText
            }`
          );
        }

        const progress = Math.min(
          ((i + batch.length) / rows.length) * 100,
          100
        );
        setSyncProgress(progress);
        setSyncStatus(
          `Syncing data... (${i + batch.length} of ${rows.length} rows)`
        );
      }

      // Refresh view
      queryClient.invalidateQueries({
        queryKey: [wsId, dataset.id],
      });

      setSyncStatus(
        `Successfully synced ${rows.length} rows from ${sheetInfo.name}!`
      );
      // Auto close dialog after successful sync
      setTimeout(() => setIsOpen(false), 1500);
    } catch (error) {
      console.error('Error during sync:', error);
      setSyncStatus(
        `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setLoading(false);
    }
  };

  const renderExcelPreview = () => (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-xl">
          <span className="i-lucide-table h-5 w-5" />
          Import Dataset
        </DialogTitle>
        {!isFileLoaded ? (
          <DialogDescription>Upload a file</DialogDescription>
        ) : (
          <div className="mt-2 flex items-center justify-between">
            <DialogDescription className="flex items-center gap-2">
              <span className="i-lucide-file-spreadsheet h-4 w-4" />
              {sheetInfo.name} • {sheetInfo.rows.toLocaleString()} rows •{' '}
              {sheetInfo.columns} columns
            </DialogDescription>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsFileLoaded(false);
                setWorkbook(null);
                setProcessedData([]);
                setExcelError(null);
                form.reset({
                  url: '',
                  headerRow: '1',
                  dataRow: '2',
                });
              }}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <span className="i-lucide-file-plus h-4 w-4" />
              Change File
            </Button>
          </div>
        )}
      </DialogHeader>

      <div className="space-y-6">
        {!isFileLoaded && renderFileUploadSection()}

        {loading && renderLoadingOverlay()}

        {excelError && renderErrorAlert()}

        {syncStatus && !excelError && renderStatusAlert()}
      </div>

      {isFileLoaded && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            {renderConfigurationSection()}
          </div>

          {processedData.length <= 1 && availableSheets.length > 1 && (
            <Alert>
              <AlertTitle className="flex items-center gap-2">
                <span className="i-lucide-alert-circle h-4 w-4" />
                No data in current sheet
              </AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  This sheet appears to be empty. Try selecting a different
                  sheet from the dropdown above.
                </p>
                {workbook && 'SheetNames' in workbook && workbook.Sheets && (
                  <div className="flex flex-wrap gap-2">
                    {availableSheets.map((sheet) => {
                      if (sheet === selectedSheet) return null;
                      const sheets = workbook.Sheets;
                      if (!sheets || typeof sheets !== 'object') return null;
                      const ws = sheets[sheet];
                      if (!ws || !ws['!ref']) return null;
                      const range = XLSX.utils.decode_range(ws['!ref']);
                      const hasData = range.e.r > 0 || range.e.c > 0;
                      if (!hasData) return null;
                      return (
                        <Button
                          key={sheet}
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSheetChange(sheet)}
                          className="flex items-center gap-2 transition-colors hover:bg-accent"
                        >
                          <span className="i-lucide-file-spreadsheet h-4 w-4" />
                          {sheet}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {processedData.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="i-lucide-table h-4 w-4" />
                  Preview Data
                </div>
                <div className="text-sm text-muted-foreground">
                  {processedData.length > 0 &&
                    `Showing ${processedData.length - 1} preview rows of ${
                      workbook && 'SheetNames' in workbook && workbook.Sheets
                        ? (
                            () => {
                              const sheets = workbook.Sheets;
                              const sheet = sheets[selectedSheet];
                              if (!sheet || !sheet['!ref'])
                                return sheetInfo.rows;
                              return XLSX.utils.decode_range(sheet['!ref']).e.r;
                            }
                          )()
                        : sheetInfo.rows
                    } total rows`}
                </div>
              </div>
              {renderDataPreview()}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={handleConfirmSync}
              disabled={loading || !!excelError || processedData.length <= 1}
              className="flex min-w-[120px] items-center gap-2 transition-colors hover:bg-primary/90"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <span className="i-lucide-download h-4 w-4" />
                  Import Data
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  const renderLoadingOverlay = () => (
    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-lg border bg-background/95 p-6 text-center shadow-lg">
        <div className="relative">
          <div className="relative h-12 w-12">
            <RefreshCw className="h-12 w-12 animate-spin text-primary/20" />
            <RefreshCw
              className="absolute inset-0 h-12 w-12 animate-spin text-primary"
              style={{ animationDelay: '-0.2s' }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-lg font-medium">{syncStatus}</p>
          {syncProgress > 0 && (
            <div className="space-y-1">
              <div className="h-2 w-48 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-in-out"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {syncProgress.toFixed(0)}% Complete
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderFileUploadSection = () => (
    <div className="grid gap-8 sm:grid-cols-2">
      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/5">
        <div className="flex items-center gap-2">
          <span className="i-lucide-hard-drive h-5 w-5 text-primary" />
          <h3 className="text-sm font-medium">Upload Local File</h3>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={loadExcelFile}
            disabled={loading}
            className="cursor-pointer transition-colors file:cursor-pointer file:bg-primary/10 file:text-primary hover:bg-accent/50"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Supported formats: .xlsx, .xls, .csv (max 10MB)
        </p>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/5">
        <div className="flex items-center gap-2">
          <span className="i-lucide-link h-5 w-5 text-primary" />
          <h3 className="text-sm font-medium">Import from URL</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              type="url"
              placeholder="https://example.com/data.xlsx"
              {...form.register('url')}
              onChange={handleUrlChange}
              disabled={loading}
              className="transition-colors hover:bg-accent/50"
            />
            {form.formState.errors.url && (
              <p className="mt-1 text-xs text-destructive">
                {form.formState.errors.url.message}
              </p>
            )}
          </div>
          <Button
            onClick={loadExcelFile}
            disabled={
              loading || !form.getValues('url') || !!form.formState.errors.url
            }
            variant="outline"
            className="flex min-w-[100px] items-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <span className="i-lucide-download h-4 w-4" />
                Load
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          URL must point to a publicly accessible Excel or CSV file
        </p>
      </div>
    </div>
  );

  const renderErrorAlert = () => (
    <Alert
      variant="destructive"
      className="duration-300 animate-in fade-in slide-in-from-top-2"
    >
      <AlertTitle className="flex items-center gap-2 text-lg">
        <span className="i-lucide-alert-circle h-5 w-5" />
        Error Loading File
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm leading-relaxed">{excelError}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExcelError(null);
              setIsFileLoaded(false);
              setWorkbook(null);
              setProcessedData([]);
              form.reset({
                url: '',
                headerRow: '1',
                dataRow: '2',
              });
            }}
            className="flex items-center gap-2"
          >
            <span className="i-lucide-file-plus h-4 w-4" />
            Try Another File
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadExcelFile()}
            disabled={!form.getValues('url')}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );

  const renderStatusAlert = () => (
    <Alert className="duration-300 animate-in fade-in slide-in-from-top-2">
      <AlertTitle className="flex items-center gap-2">
        <Info className="h-4 w-4" />
        Status
      </AlertTitle>
      <AlertDescription className="mt-1">
        <p className="text-sm">{syncStatus}</p>
        {syncProgress > 0 && (
          <div className="mt-2 space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300 ease-in-out"
                style={{ width: `${syncProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {syncProgress.toFixed(0)}% Complete
            </p>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );

  const renderConfigurationSection = () => (
    <Form {...form}>
      <form className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {availableSheets.length > 1 && (
            <FormItem>
              <FormLabel>Sheet</FormLabel>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                value={selectedSheet}
                onChange={(e) => handleSheetChange(e.target.value)}
              >
                {availableSheets.map((sheet) => (
                  <option key={sheet} value={sheet}>
                    {sheet}
                  </option>
                ))}
              </select>
              <FormDescription>Select the sheet to import</FormDescription>
            </FormItem>
          )}
          <FormField
            control={form.control}
            name="headerRow"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Header Row</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min="1"
                    placeholder="1"
                    onChange={(e) => {
                      field.onChange(e);
                      handleConfigChange();
                    }}
                    className="transition-colors hover:bg-accent/50"
                  />
                </FormControl>
                <FormDescription>
                  Row number containing column headers
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dataRow"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data Start Row</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min="1"
                    placeholder="2"
                    onChange={(e) => {
                      field.onChange(e);
                      handleConfigChange();
                    }}
                    className="transition-colors hover:bg-accent/50"
                  />
                </FormControl>
                <FormDescription>
                  First row containing actual data
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </form>
    </Form>
  );

  const renderDataPreview = () => (
    <div className="mt-4 rounded-lg border bg-card shadow-sm">
      <div className="max-h-[400px] overflow-auto">
        <div className="relative w-full">
          <div className="overflow-x-auto">
            <table className="w-full divide-y divide-border">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur supports-backdrop-filter:bg-background/60">
                <tr>
                  {processedData[0]?.map((header: string, index: number) => (
                    <th
                      key={index}
                      className="border-b p-2 text-left text-sm font-medium"
                      style={{ minWidth: '150px', maxWidth: '200px' }}
                    >
                      <div className="truncate">{header}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {processedData
                  .slice(1)
                  .map((row: ProcessedDataRow[], rowIndex: number) => (
                    <tr
                      key={rowIndex}
                      className="transition-colors hover:bg-muted/50"
                    >
                      {row.map(
                        (cell: string | number | null, cellIndex: number) => (
                          <td
                            key={cellIndex}
                            className="p-2 text-sm"
                            title={String(cell || '')}
                          >
                            <div className="line-clamp-1">
                              {String(cell || '')}
                            </div>
                          </td>
                        )
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-[90vw]">
        {renderExcelPreview()}
      </DialogContent>
    </Dialog>
  );
}
