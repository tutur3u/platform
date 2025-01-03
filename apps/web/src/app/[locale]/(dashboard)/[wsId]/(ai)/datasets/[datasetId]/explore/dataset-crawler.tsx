'use client';

// Fix imports - remove duplicate
import { HtmlCrawler } from './html-crawler';
import type { WorkspaceDataset } from '@/types/db';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@repo/ui/components/ui/alert';
import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { Card, CardContent } from '@repo/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@repo/ui/components/ui/pagination';
import { Progress } from '@repo/ui/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/ui/tabs';
import {
  Bug,
  Check,
  Clock,
  Code2,
  ExternalLink,
  RefreshCw,
  ScanSearch,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as XLSX from 'xlsx';
import { z } from 'zod';

const FormSchema = z.object({
  url: z
    .string()
    .url({ message: 'Please enter a valid URL' })
    .regex(/\.(xlsx|xls)$/i, {
      message: 'URL must point to an Excel file',
    }),
  headerRow: z.string().optional(),
  dataRow: z.string().min(1, {
    message: 'Data row is required.',
  }),
});

interface SyncMetrics {
  totalColumns: number;
  syncedColumns: number;
  totalRows: number;
  syncedRows: number;
  rowBatches: number;
  currentBatch: number;
  startTime: number;
  estimatedTimeLeft: string;
}

interface HtmlPreviewData {
  url: string;
  columnName: string;
  selector: string;
  subSelector?: string;
  attribute?: string;
  sampleData?: string[];
}

interface UrlLog {
  url: string;
  timestamp: number;
  success: boolean;
}

interface QueueItem {
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: number;
}

export function DatasetCrawler({
  wsId,
  dataset,
}: {
  wsId: string;
  dataset: WorkspaceDataset;
}) {
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [, setRawData] = useState<any[][]>([]);
  const [processedData, setProcessedData] = useState<any[][]>([]);
  const [sheetInfo, setSheetInfo] = useState({ rows: 0, columns: 0, name: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [, setColumns] = useState<any[]>([]);
  const [, setRows] = useState<any[]>([]);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState('');
  const [, setSyncMetrics] = useState<SyncMetrics>({
    totalColumns: 0,
    syncedColumns: 0,
    totalRows: 0,
    syncedRows: 0,
    rowBatches: 0,
    currentBatch: 0,
    startTime: 0,
    estimatedTimeLeft: '-',
  });
  const [htmlPreview, setHtmlPreview] = useState<HtmlPreviewData[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rawHtml, setRawHtml] = useState<string>('');
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const previewPageSize = 5;
  const [urlLogs, setUrlLogs] = useState<UrlLog[]>([]);
  const [urlQueue, setUrlQueue] = useState<QueueItem[]>([]);
  const [activeUrl, setActiveUrl] = useState<string>('');

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

  // Calculate pagination values
  const totalRows = processedData.length - 1; // Subtract header row
  const totalPages = Math.ceil(totalRows / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1; // +1 to skip header
  const endIndex = Math.min(startIndex + pageSize - 1, totalRows);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      url: dataset.url || '',
      headerRow: '',
      dataRow: '',
    },
  });

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      setLoading(true);

      const response = await fetch(
        `/api/proxy?url=${encodeURIComponent(data.url)}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);

      const sheetName =
        workbook.SheetNames.find(
          (name) =>
            name.toLowerCase().includes('monthly') ||
            name.toLowerCase().includes('price')
        ) || workbook.SheetNames[0];

      if (!sheetName) {
        throw new Error('No suitable sheet found in the workbook');
      }

      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        throw new Error('Worksheet is undefined');
      }

      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      const excelData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
      }) as any[][];

      setRawData(excelData);
      setSheetInfo({
        rows: range.e.r + 1,
        columns: range.e.c + 1,
        name: sheetName,
      });

      // Process the data with header and data row configurations
      const headerRowIndex = data.headerRow ? parseInt(data.headerRow) - 1 : -1;
      const dataRowIndex = parseInt(data.dataRow) - 1;

      const headers =
        headerRowIndex >= 0
          ? excelData[headerRowIndex]
          : Array.from(
              { length: excelData[0]?.length || 0 },
              (_, i) => `Column ${i + 1}`
            );

      const processedRows = excelData ? excelData.slice(dataRowIndex) : [];
      setProcessedData([headers, ...processedRows] as any[][]);
    } catch (error) {
      console.error('Error processing Excel file:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageSizeChange = (value: string) => {
    const newSize = parseInt(value);
    setPageSize(newSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const getPageHref = (page: number) => {
    // Using # since we're handling navigation in-memory
    return `#page=${page}`;
  };

  const handlePageClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    page: number
  ) => {
    e.preventDefault();
    setCurrentPage(page);
  };

  const updateProgress = (metrics: Partial<SyncMetrics>) => {
    setSyncMetrics((prev) => {
      const updated = { ...prev, ...metrics };
      // Calculate estimated time left based on progress
      if (updated.startTime && (updated.syncedRows || updated.syncedColumns)) {
        const elapsed = (Date.now() - updated.startTime) / 1000; // seconds
        const totalItems = updated.totalRows + updated.totalColumns;
        const completedItems = updated.syncedRows + updated.syncedColumns;
        const itemsPerSecond = completedItems / elapsed;
        const remainingItems = totalItems - completedItems;
        const remainingSeconds = remainingItems / itemsPerSecond;

        if (remainingSeconds > 0) {
          updated.estimatedTimeLeft =
            remainingSeconds > 60
              ? `${Math.ceil(remainingSeconds / 60)}m`
              : `${Math.ceil(remainingSeconds)}s`;
        }
      }
      return updated;
    });
  };

  const syncDataset = async () => {
    try {
      setLoading(true);
      setSyncProgress(0);
      setSyncStatus('Analyzing dataset...');
      setUrlLogs([]); // Clear previous logs

      // Handle HTML crawling
      if (dataset.type === 'html' && dataset?.html_ids?.length) {
        const crawler = new HtmlCrawler();
        setSyncStatus('Starting HTML crawling...');

        const htmlData = await crawler.crawl({
          url: dataset.url!,
          htmlIds: dataset.html_ids,
          onProgress: (progress, status) => {
            setSyncProgress(progress);
            setSyncStatus(status);
          },
          onUrlFetch: (url, success) => {
            setUrlLogs((prev) => [
              ...prev,
              { url, success, timestamp: Date.now() },
            ]);
          },
        });

        // Get column names from HTML IDs
        const columnNames = dataset.html_ids
          .map((id) => {
            const match = id.match(/{{(.+?)}}/);
            return match ? match[1] : '';
          })
          .filter(Boolean);

        // Sync columns
        const columnsToSync = columnNames.map((name) => ({ name }));
        await fetch(
          `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/columns/sync`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ columns: columnsToSync }),
          }
        );

        // Sync rows
        await fetch(
          `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/rows/sync`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: htmlData }),
          }
        );

        setSyncProgress(100);
        setSyncStatus('Sync completed successfully!');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setIsOpen(false);
        window.location.reload();
        return;
      }

      const headers = processedData[0];
      const allRows = processedData.slice(1); // Get all rows

      console.log('Total rows to sync:', allRows.length); // Debug log

      updateProgress({
        totalColumns: headers?.length,
        totalRows: allRows.length,
        syncedColumns: 0,
        syncedRows: 0,
        rowBatches: Math.ceil(allRows.length / 100),
        currentBatch: 0,
      });

      // Sync columns first
      setSyncProgress(5);
      setSyncStatus(`Preparing to sync ${headers?.length || 0} columns...`);

      const columnsToSync = headers
        ?.map((name: string) => ({
          name: String(name).trim(),
        }))
        .filter((col) => !!col.name);

      const columnsResponse = await fetch(
        `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/columns/sync`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columns: columnsToSync }),
        }
      );

      if (!columnsResponse.ok) {
        throw new Error('Failed to sync columns');
      }

      updateProgress({ syncedColumns: headers?.length });
      setSyncProgress(30);
      setSyncStatus(`Columns synced successfully (${headers?.length} columns)`);

      // Sync rows in batches
      const batchSize = 100;
      const totalBatches = Math.ceil(allRows.length / batchSize);

      for (let i = 0; i < allRows.length; i += batchSize) {
        const batch = allRows.slice(i, Math.min(i + batchSize, allRows.length));
        const currentBatch = Math.floor(i / batchSize) + 1;

        console.log(
          `Processing batch ${currentBatch}/${totalBatches}, size: ${batch.length}`
        ); // Debug log

        setSyncStatus(
          `Syncing rows (Batch ${currentBatch}/${totalBatches}): ` +
            `${i + 1} to ${Math.min(i + batchSize, allRows.length)} of ${allRows.length} rows`
        );

        updateProgress({
          currentBatch,
          syncedRows: i,
        });

        const processedBatch = batch.map((row: any[]) => {
          const rowData: Record<string, any> = {};
          headers?.forEach((header: string, index: number) => {
            if (header && index < row.length) {
              const value = row[index];
              rowData[String(header).trim()] =
                value !== undefined ? value : null;
            }
          });
          return rowData;
        });

        console.log(`Processed batch size: ${processedBatch.length}`); // Debug log

        const rowsResponse = await fetch(
          `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/rows/sync`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: processedBatch }),
          }
        );

        if (!rowsResponse.ok) {
          const error = await rowsResponse.json();
          throw new Error(error.error || 'Failed to sync rows batch');
        }

        const progress = 30 + (70 * (i + batch.length)) / allRows.length;
        setSyncProgress(Math.round(progress));
        updateProgress({ syncedRows: i + batch.length });
      }

      setSyncProgress(100);
      setSyncStatus('Sync completed successfully!');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsOpen(false);
      window.location.reload();
    } catch (error) {
      console.error('Error syncing dataset:', error);
      if (error instanceof Error) {
        setSyncStatus(`Sync failed: ${error.message}`);
      } else {
        setSyncStatus('Sync failed: An unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchHtmlPreview = async () => {
    if (!dataset.url || !dataset.html_ids?.length) return;

    setPreviewLoading(true);
    setUrlLogs([]);
    setUrlQueue([]);
    setActiveUrl('');

    try {
      const crawler = new HtmlCrawler();
      const { mainPage, articlePreviews } = await crawler.getPreview({
        url: dataset.url,
        htmlIds: dataset.html_ids,
        onProgress: (progress, status) => {
          setSyncProgress(progress);
          setSyncStatus(status);
        },
        onUrlFetch: (url, success) => {
          setUrlLogs((prev) => [
            ...prev,
            { url, success, timestamp: Date.now() },
          ]);
          setActiveUrl(url);

          // Update queue
          setUrlQueue((prev) => {
            const newQueue = [...prev];
            const existingIndex = newQueue.findIndex(
              (item) => item.url === url
            );

            if (existingIndex >= 0 && newQueue[existingIndex]) {
              newQueue[existingIndex].status = success ? 'completed' : 'failed';
            }

            return newQueue;
          });
        },
        onQueueUpdate: (urls: string[]) => {
          setUrlQueue(
            urls.map((url) => ({
              url,
              status: 'pending',
              timestamp: Date.now(),
            }))
          );
        },
      });

      setHtmlPreview(mainPage);
      setPreviewRows(articlePreviews);

      const response = await fetch(
        `/api/proxy?url=${encodeURIComponent(dataset.url)}`
      );
      const html = await response.text();
      setRawHtml(html);
    } finally {
      setPreviewLoading(false);
      setActiveUrl('');
    }
  };

  useEffect(() => {
    if (isOpen && dataset.type === 'html') {
      fetchHtmlPreview();
    }
  }, [isOpen, dataset.type]);

  const renderHtmlPreview = () => {
    if (!dataset.url || !dataset.html_ids?.length) {
      return (
        <Alert>
          <AlertTitle>No HTML selectors configured</AlertTitle>
          <AlertDescription>
            Add HTML selectors in the dataset settings to start crawling.
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <Tabs defaultValue="preview">
        <TabsList className="w-full">
          <TabsTrigger value="preview" className="flex items-center gap-2">
            <ScanSearch className="h-4 w-4" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="debug" className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            Debug
          </TabsTrigger>
          <TabsTrigger value="raw" className="flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            Raw HTML
          </TabsTrigger>
          <TabsTrigger value="rows" className="flex items-center gap-2">
            <ScanSearch className="h-4 w-4" />
            Preview Rows
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            URL Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  <a
                    href={dataset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-500 hover:underline"
                  >
                    {dataset.url}
                  </a>
                </div>
                <Button variant="outline" size="sm" onClick={fetchHtmlPreview}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Preview
                </Button>
              </div>
            </CardContent>
          </Card>

          {previewLoading ? (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">Current Progress</h3>
                        <Badge variant="outline" className="animate-pulse">
                          Processing...
                        </Badge>
                      </div>
                      <span className="text-muted-foreground text-sm">
                        {syncProgress}% Complete
                      </span>
                    </div>

                    <Progress value={syncProgress} className="h-2" />

                    {activeUrl && (
                      <div className="flex items-center gap-2 rounded-md border p-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <code className="text-muted-foreground flex-1 truncate text-xs">
                          {activeUrl}
                        </code>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Queue Card */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">URL Queue</h3>
                        <Badge variant="outline">
                          {urlQueue.length} pending
                        </Badge>
                      </div>
                      <div className="max-h-[200px] space-y-2 overflow-y-auto">
                        {urlQueue.map((item, index) => (
                          <div
                            key={index}
                            className={`flex items-center gap-2 rounded-md border p-2 ${
                              item.status === 'processing' ? 'bg-muted/50' : ''
                            }`}
                          >
                            {item.status === 'pending' && (
                              <Clock className="text-muted-foreground h-4 w-4" />
                            )}
                            {item.status === 'processing' && (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            )}
                            {item.status === 'completed' && (
                              <Check className="h-4 w-4 text-green-500" />
                            )}
                            {item.status === 'failed' && (
                              <X className="h-4 w-4 text-red-500" />
                            )}
                            <code className="text-muted-foreground flex-1 truncate text-xs">
                              {item.url}
                            </code>
                            <time className="text-muted-foreground shrink-0 text-xs">
                              {new Date(item.timestamp).toLocaleTimeString()}
                            </time>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Logs Card */}
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Recent Activity</h3>
                        <Badge variant="outline">
                          {urlLogs.length} processed
                        </Badge>
                      </div>
                      <div className="max-h-[200px] space-y-2 overflow-y-auto">
                        {urlLogs.slice(-5).map((log, index) => (
                          <div
                            key={index}
                            className={`flex items-center gap-2 rounded-md border p-2 ${
                              log.success ? 'bg-green-500/5' : 'bg-red-500/5'
                            }`}
                          >
                            {log.success ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <X className="h-4 w-4 text-red-500" />
                            )}
                            <code className="text-muted-foreground flex-1 truncate text-xs">
                              {log.url}
                            </code>
                            <time className="text-muted-foreground shrink-0 text-xs">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </time>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {htmlPreview.map((preview, index) => (
                <Card key={index}>
                  <CardContent className="pt-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">
                            {preview.columnName}
                          </h3>
                          <Badge
                            variant={
                              preview.sampleData?.length
                                ? 'success'
                                : 'destructive'
                            }
                          >
                            {preview.sampleData?.length || 0} matches
                          </Badge>
                        </div>
                        <Badge
                          variant={
                            preview.subSelector ? 'default' : 'secondary'
                          }
                        >
                          {preview.subSelector
                            ? 'Multiple Elements'
                            : 'Single Element'}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground space-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          Selector:{' '}
                          <code className="text-xs">{preview.selector}</code>
                        </div>
                        {preview.subSelector && (
                          <div className="flex items-center gap-2">
                            Sub-selector:{' '}
                            <code className="text-xs">
                              {preview.subSelector}
                            </code>
                          </div>
                        )}
                        {preview.attribute && (
                          <div className="flex items-center gap-2">
                            Attribute:{' '}
                            <code className="text-xs">{preview.attribute}</code>
                          </div>
                        )}
                      </div>
                      <div className="mt-2">
                        <div className="text-sm font-medium">Sample Data:</div>
                        {preview.sampleData?.length ? (
                          <div className="mt-1 space-y-1">
                            {preview.sampleData.map((sample, i) => (
                              <div
                                key={i}
                                className="text-muted-foreground bg-muted/50 rounded-md p-2 text-sm"
                              >
                                {sample}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Alert variant="destructive" className="mt-2">
                            <AlertTitle>No matches found</AlertTitle>
                            <AlertDescription>
                              Check your selector syntax and try again.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="debug" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <h3 className="font-semibold">Debug Information</h3>
                <div className="grid gap-2">
                  {htmlPreview.map((preview, index) => (
                    <Alert key={index}>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <AlertTitle>{preview.columnName}</AlertTitle>
                          <Badge>
                            {preview.sampleData?.length || 0} matches
                          </Badge>
                        </div>
                        <AlertDescription>
                          <code className="w-full whitespace-pre-wrap">
                            {`Original: ${preview.selector}${preview.subSelector ? `\nSub-selector: ${preview.subSelector}` : ''}${preview.attribute ? `\nAttribute: ${preview.attribute}` : ''}
Full path: ${preview.selector}${preview.subSelector ? ` → ${preview.subSelector}` : ''}${preview.attribute ? ` {${preview.attribute}}` : ''}`}
                          </code>
                        </AlertDescription>
                      </div>
                    </Alert>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="raw" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Raw HTML Preview</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchHtmlPreview}
                  >
                    Refresh
                  </Button>
                </div>
                <div className="max-h-[500px] overflow-auto rounded-md border">
                  <code className="w-full whitespace-pre-wrap p-4">
                    {rawHtml || 'No HTML content loaded'}
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rows" className="space-y-4">
          {renderPreviewRows()}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">URL Fetch Logs</h3>
                    <Badge variant="outline">{urlLogs.length} requests</Badge>
                  </div>
                  {loading && (
                    <Badge variant="secondary" className="animate-pulse">
                      Fetching...
                    </Badge>
                  )}
                </div>

                <div className="max-h-[400px] overflow-y-auto rounded-md border">
                  {urlLogs.length > 0 ? (
                    <div className="divide-y">
                      {urlLogs.map((log, index) => (
                        <div
                          key={index}
                          className={`flex items-center justify-between p-3 ${
                            log.success ? 'bg-green-500/5' : 'bg-red-500/5'
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            {log.success ? (
                              <Badge variant="success" className="shrink-0">
                                Success
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="shrink-0">
                                Failed
                              </Badge>
                            )}
                            <code className="text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap text-xs">
                              {log.url}
                            </code>
                          </div>
                          <time className="text-muted-foreground shrink-0 text-xs">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </time>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center">
                      <span className="text-muted-foreground text-sm">
                        No URLs fetched yet
                      </span>
                    </div>
                  )}
                </div>

                {loading && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">
                        {syncStatus}
                      </span>
                      <span className="text-sm font-medium">
                        {syncProgress}%
                      </span>
                    </div>
                    <Progress value={syncProgress} className="h-2" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    );
  };

  const renderPreviewRows = () => {
    const startIdx = (previewPage - 1) * previewPageSize;
    const endIdx = startIdx + previewPageSize;
    const totalPages = Math.ceil(previewRows.length / previewPageSize);

    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Preview Rows</h3>
              <Badge>{previewRows.length} rows found</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border">
                <thead>
                  <tr className="bg-muted">
                    {dataset.html_ids?.map((id) => {
                      const match = id.match(/{{(.+?)}}/);
                      return match ? (
                        <th key={match[1]} className="border p-2 text-left">
                          {match[1]}
                        </th>
                      ) : null;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {Object.entries(row).map(([key, value]) => (
                        <td key={key} className="border p-2">
                          {key === 'URL' ? (
                            <a
                              href={value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline"
                            >
                              {value}
                            </a>
                          ) : (
                            value
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-muted-foreground text-sm">
                Showing {startIdx + 1} to {Math.min(endIdx, previewRows.length)}{' '}
                of {previewRows.length} rows
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      className={
                        previewPage === 1
                          ? 'pointer-events-none opacity-50'
                          : ''
                      }
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(
                      (page) =>
                        page === 1 ||
                        page === totalPages ||
                        (page >= previewPage - 1 && page <= previewPage + 1)
                    )
                    .map((page, index, array) => {
                      if (index > 0 && array[index - 1] !== page - 1) {
                        return (
                          <PaginationItem key={`ellipsis-${page}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }
                      return (
                        <PaginationItem key={page}>
                          <PaginationLink
                            href={getPageHref(page)}
                            onClick={(e) => handlePageClick(e, page)}
                            isActive={page === previewPage}
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        setPreviewPage((p) => Math.min(totalPages, p + 1))
                      }
                      className={
                        previewPage === totalPages
                          ? 'pointer-events-none opacity-50'
                          : ''
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderDialogContent = () => {
    if (dataset.type === 'html') {
      return (
        <>
          <DialogHeader>
            <DialogTitle>HTML Dataset Preview</DialogTitle>
            <DialogDescription>
              Preview and debug HTML selectors
            </DialogDescription>
          </DialogHeader>
          {renderHtmlPreview()}
        </>
      );
    }

    // Excel/CSV content
    return (
      <>
        <DialogHeader>
          <DialogTitle>Excel Dataset Preview</DialogTitle>
          <DialogDescription>
            {sheetInfo.name
              ? `Sheet: ${sheetInfo.name} (${sheetInfo.rows} rows, ${sheetInfo.columns} columns)`
              : 'Configure and fetch your Excel dataset'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Excel File URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://example.com/data.xlsx"
                      {...field}
                      disabled
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the URL of an Excel file (.xlsx or .xls)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="headerRow"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Header Row</FormLabel>
                    <FormControl>
                      <Input placeholder="1" {...field} />
                    </FormControl>
                    <FormDescription>Leave blank for no header</FormDescription>
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
                      <Input placeholder="2" {...field} />
                    </FormControl>
                    <FormDescription>1-based row index</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Processing...' : 'Fetch and Process'}
            </Button>
          </form>
        </Form>

        {processedData.length > 0 && <Separator />}
        {processedData.length > 0 && (
          <div className="mt-4 flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  Rows per page:
                </span>
                <Select
                  value={pageSize.toString()}
                  onValueChange={handlePageSizeChange}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue placeholder="10" />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 50, 100].map((size) => (
                      <SelectItem key={size} value={size.toString()}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-muted-foreground text-sm">
                Showing rows {startIndex} to {endIndex} of {totalRows}
              </div>
            </div>

            <div className="grid grid-cols-1 overflow-x-auto">
              <div className="w-fit">
                <table className="border-foreground/30 w-full table-auto border-collapse border">
                  <thead>
                    <tr className="[&_th]:bg-foreground/20">
                      {processedData[0]?.map((header: any, index: number) => (
                        <th
                          key={index}
                          className="border-foreground/30 border px-4 py-2"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {processedData
                      .slice(startIndex, startIndex + pageSize)
                      .map((row: any[], rowIndex: number) => (
                        <tr key={rowIndex}>
                          {row.map((cell: any, cellIndex: number) => (
                            <td
                              key={cellIndex}
                              className="border-foreground/30 border px-4 py-2"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={getPageHref(currentPage - 1)}
                    onClick={(e) => handlePageClick(e, currentPage - 1)}
                    className={
                      currentPage === 1 ? 'pointer-events-none opacity-50' : ''
                    }
                  />
                </PaginationItem>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (page) =>
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                  )
                  .map((page, index, array) => {
                    if (index > 0 && array[index - 1] !== page - 1) {
                      return (
                        <PaginationItem key={`ellipsis-${page}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          href={getPageHref(page)}
                          onClick={(e) => handlePageClick(e, page)}
                          isActive={page === currentPage}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                <PaginationItem>
                  <PaginationNext
                    href={getPageHref(currentPage + 1)}
                    onClick={(e) => handlePageClick(e, currentPage + 1)}
                    className={
                      currentPage === totalPages
                        ? 'pointer-events-none opacity-50'
                        : ''
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button onClick={() => setIsOpen(true)} disabled={!dataset.url}>
          <RefreshCw className="h-4 w-4" />
          Sync Dataset
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-[90vw]">
        {renderDialogContent()}

        {/* Move sync status and button outside tabs but inside dialog */}
        <div className="mt-4 flex flex-col gap-2">
          {loading && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  {syncStatus}
                </span>
                <span className="text-sm font-medium">{syncProgress}%</span>
              </div>
              <Progress value={syncProgress} className="h-2" />
            </>
          )}
          <div className="flex justify-end">
            <Button onClick={syncDataset} disabled={loading}>
              {loading ? 'Syncing...' : 'Sync Dataset'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
