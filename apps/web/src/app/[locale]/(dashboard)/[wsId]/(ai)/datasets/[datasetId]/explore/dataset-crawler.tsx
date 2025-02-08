'use client';

import { CrawlControls } from './components/CrawlControls';
import { MetricsPanel } from './components/MetricsPanel';
import { PendingUrlsCard } from './components/PendingUrlsCard';
import { RecentFetchesCard } from './components/RecentFetchesCard';
import { CsvCrawler } from './crawlers/csv-crawler';
import { ExcelCrawler } from './crawlers/excel-crawler';
import { HtmlCrawler } from './crawlers/html-crawler';
import type { CrawlMetrics, QueueItem, UrlWithProgress } from './types';
import { calculateEstimatedTime } from './utils/time';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import type { WorkspaceDataset } from '@repo/types/db';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
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
import { useEffect, useRef, useState } from 'react';
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

interface PageProgress {
  pageNumber: number;
  progress: number;
  status: 'pending' | 'fetching' | 'processing' | 'complete' | 'error';
  articleCount?: number;
  fetchedArticles?: number;
}

interface ActiveFetches {
  controller: AbortController;
  url: string;
}

export function DatasetCrawler({
  wsId,
  dataset,
}: {
  wsId: string;
  dataset: WorkspaceDataset;
}) {
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [processedData, setProcessedData] = useState<any[][]>([]);
  const [sheetInfo, setSheetInfo] = useState({ rows: 0, columns: 0, name: '' });
  const [, setCurrentPage] = useState(1);
  const [, setColumns] = useState<any[]>([]);
  const [, setRows] = useState<any[]>([]);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState('');
  const [htmlPreview, setHtmlPreview] = useState<HtmlPreviewData[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rawHtml, setRawHtml] = useState<string>('');
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const previewPageSize = 5;
  const [urlLogs, setUrlLogs] = useState<UrlLog[]>([]);
  const [urlQueue, setUrlQueue] = useState<QueueItem[]>([]);
  const [activeUrl, setActiveUrl] = useState<string>('');
  const [pageProgresses, setPageProgresses] = useState<PageProgress[]>([]);
  const [, setTotalPages] = useState(0);
  const [metrics, setMetrics] = useState<CrawlMetrics>({
    startTime: 0,
    totalPages: 0,
    completedPages: 0,
    totalArticles: 0,
    processedArticles: 0,
    requestCount: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageRequestTime: 0,
    estimatedTimeLeft: '',
  });
  const [crawlState, setCrawlState] = useState<
    'idle' | 'running' | 'paused' | 'completed'
  >('idle');
  const activeFetchesRef = useRef<ActiveFetches[]>([]);
  const [recentFetches, setRecentFetches] = useState<UrlWithProgress[]>([]);
  const [pendingUrls, setPendingUrls] = useState<UrlWithProgress[]>([]);
  const [maxPages, setMaxPages] = useState<string | undefined>();
  const [maxArticles, setMaxArticles] = useState<string | undefined>();
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | any[][] | null>(
    null
  );
  const [excelError, setExcelError] = useState<string | null>(null);
  const [isFileLoaded, setIsFileLoaded] = useState(false);

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

  // Remove the automatic fetchHtmlPreview call on dialog open
  useEffect(() => {
    if (isOpen) {
      // Just prepare the initial state
      setSyncStatus('Ready to start crawling');
      setCrawlState('idle');
      setMetrics({
        startTime: 0,
        totalPages: 0,
        completedPages: 0,
        totalArticles: 0,
        processedArticles: 0,
        requestCount: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageRequestTime: 0,
        estimatedTimeLeft: '',
      });
    }
  }, [isOpen]);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      url: dataset.url || '',
      headerRow: '',
      dataRow: '',
    },
  });

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

  const handleConfirmSync = async () => {
    try {
      setLoading(true);
      setSyncStatus('Starting sync with server...');

      if ((dataset.type === 'excel' || dataset.type === 'csv') && dataset.url) {
        const crawler = dataset.url.toLowerCase().endsWith('.csv')
          ? new CsvCrawler()
          : new ExcelCrawler();

        setSyncStatus('Fetching and parsing file...');
        const { headers, data, sheetInfo } = await crawler.crawl({
          url: dataset.url,
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
            const headerName =
              header.toString().trim() || `Column ${index + 1}`;
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
          const rowData: Record<string, any> = {};
          uniqueHeaders.forEach((header, index) => {
            // Preserve the original value type (number, string, etc.)
            rowData[header] = row[index] !== undefined ? row[index] : '';
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
      }
    } catch (error) {
      console.error('Error during sync:', error);
      setSyncStatus(
        `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
          setMetrics((prev) => ({
            ...prev,
            requestCount: prev.requestCount + 1,
            successfulRequests: prev.successfulRequests + (success ? 1 : 0),
            failedRequests: prev.failedRequests + (success ? 0 : 1),
          }));
        },
        onQueueUpdate: (urls: string[]) => {
          setUrlQueue(
            urls.map((url) => ({
              url,
              status: 'pending',
              timestamp: Date.now(),
              progress: 0,
            }))
          );
        },
        onUrlProgress: (url: string, progress: number, subStatus?: string) => {
          updateUrlProgress(url, progress, subStatus);
        },
        onPageProgress: handlePageProgress,
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

  const renderPreviewTab = () => (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            {dataset.url && (
              <a
                href={dataset.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-500 hover:underline"
              >
                {dataset.url}
              </a>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={fetchHtmlPreview}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Load Preview
          </Button>
        </div>
      </CardContent>
    </Card>
  );

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
          {renderPreviewTab()}
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
                      <span className="text-sm text-muted-foreground">
                        {syncProgress}% Complete
                      </span>
                    </div>

                    <Progress value={syncProgress} className="h-2" />

                    {activeUrl && (
                      <div className="flex items-center gap-2 rounded-md border p-2">
                        <RefreshCw className="h-4 w-4 flex-none animate-spin" />
                        <code className="line-clamp-1 w-full text-xs text-muted-foreground">
                          {activeUrl}
                        </code>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Queue Card */}
                {renderQueueCard()}

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
                            <code className="flex-1 truncate text-xs text-muted-foreground">
                              {log.url}
                            </code>
                            <time className="shrink-0 text-xs text-muted-foreground">
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
                      <div className="space-y-1 text-sm text-muted-foreground">
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
                                className="rounded-md bg-muted/50 p-2 text-sm text-muted-foreground"
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
                  <code className="w-full p-4 whitespace-pre-wrap">
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
          {renderUrlLogs()}
        </TabsContent>
      </Tabs>
    );
  };

  const renderPreviewRows = () => {
    const startIdx = (previewPage - 1) * previewPageSize;
    const endIdx = startIdx + previewPageSize;
    const previewTotalPages = Math.ceil(previewRows.length / previewPageSize);

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
              <div className="text-sm text-muted-foreground">
                Showing {startIdx + 1} to {Math.min(endIdx, previewRows.length)}{' '}
                of {previewRows.length} rows
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItemWithProgress page={previewPage - 1}>
                    <PaginationPrevious
                      onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                      className={
                        previewPage === 1
                          ? 'pointer-events-none opacity-50'
                          : ''
                      }
                    />
                  </PaginationItemWithProgress>
                  {Array.from({ length: previewTotalPages }, (_, i) => i + 1)
                    .filter(
                      (page) =>
                        page === 1 ||
                        page === previewTotalPages ||
                        (page >= previewPage - 1 && page <= previewPage + 1)
                    )
                    .map((page, index, array) => {
                      if (index > 0 && array[index - 1] !== page - 1) {
                        return (
                          <PaginationItemWithProgress
                            key={`ellipsis-${page}`}
                            page={page}
                          >
                            <PaginationEllipsis />
                          </PaginationItemWithProgress>
                        );
                      }
                      return (
                        <PaginationItemWithProgress key={page} page={page}>
                          <PaginationLink
                            href={getPageHref(page)}
                            onClick={(e) => handlePageClick(e, page)}
                            isActive={page === previewPage}
                          >
                            {page}
                          </PaginationLink>
                          {renderPageProgress(page)}
                        </PaginationItemWithProgress>
                      );
                    })}
                  <PaginationItemWithProgress page={previewPage + 1}>
                    <PaginationNext
                      onClick={() =>
                        setPreviewPage((p) =>
                          Math.min(previewTotalPages, p + 1)
                        )
                      }
                      className={
                        previewPage === previewTotalPages
                          ? 'pointer-events-none opacity-50'
                          : ''
                      }
                    />
                  </PaginationItemWithProgress>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderDialogContent = () => {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Dataset Synchronization</DialogTitle>
          <DialogDescription>
            {dataset.type === 'html'
              ? 'HTML Crawler Status'
              : 'Excel Import Status'}
          </DialogDescription>
        </DialogHeader>

        {/* Show controls for HTML datasets */}
        {dataset.type === 'html' && (
          <div className="flex items-center justify-between border-b pb-4">
            <CrawlControls
              crawlState={crawlState}
              maxPages={maxPages}
              maxArticles={maxArticles}
              onStart={startCrawl}
              onPause={() => setCrawlState('paused')}
              onResume={() => setCrawlState('running')}
              onStop={stopCrawl}
              onMaxPagesChange={setMaxPages}
              onMaxArticlesChange={setMaxArticles}
            />
            <div className="text-sm text-muted-foreground">{syncStatus}</div>
          </div>
        )}

        {/* Show metrics panel when crawling */}
        {crawlState !== 'idle' && dataset.type === 'html' && (
          <>
            <MetricsPanel metrics={metrics} crawlState={crawlState} />
            {renderMetricsAndQueues()}
          </>
        )}

        {/* Existing content */}
        {dataset.type === 'html' ? renderHtmlPreview() : renderExcelPreview()}
      </>
    );
  };

  const renderExcelPreview = () => (
    <>
      <DialogHeader>
        <DialogTitle>Excel Dataset Preview</DialogTitle>
        <DialogDescription>
          {!isFileLoaded
            ? 'Click load to start importing'
            : `Sheet: ${sheetInfo.name} (${sheetInfo.rows} rows, ${sheetInfo.columns} columns)`}
        </DialogDescription>
      </DialogHeader>

      {!isFileLoaded ? (
        <div className="flex justify-center">
          <Button
            onClick={loadExcelFile}
            disabled={loading}
            variant="outline"
            size="lg"
          >
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Load Excel File
              </>
            )}
          </Button>
        </div>
      ) : (
        <>
          <Form {...form}>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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

          {excelError && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{excelError}</AlertDescription>
            </Alert>
          )}

          {processedData.length > 0 && (
            <div className="mt-4 overflow-auto">
              <table className="w-full border-collapse border">
                <thead>
                  <tr className="bg-muted">
                    {processedData[0]?.map((header: string, index: number) => (
                      <th key={index} className="border p-2 text-left">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {processedData
                    .slice(1)
                    .map((row: any[], rowIndex: number) => (
                      <tr key={rowIndex}>
                        {row.map((cell: any, cellIndex: number) => (
                          <td key={cellIndex} className="border p-2">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {processedData.length > 0 &&
                `Showing ${Math.min(10, processedData.length - 1)} of ${
                  sheetInfo.rows
                } rows`}
            </div>
            <Button
              onClick={handleConfirmSync}
              disabled={loading || !!excelError}
            >
              {loading ? 'Syncing...' : 'Confirm and Sync'}
            </Button>
          </div>
        </>
      )}
    </>
  );

  const renderPageProgress = (page: number) => {
    const progress = pageProgresses.find((p) => p.pageNumber === page);
    if (!progress) return null;

    return (
      <div className="absolute inset-x-0 -bottom-1">
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full transition-all duration-300',
              progress.status === 'complete' && 'bg-green-500',
              progress.status === 'error' && 'bg-red-500',
              progress.status === 'processing' && 'bg-blue-500',
              progress.status === 'fetching' && 'bg-yellow-500'
            )}
            style={{ width: `${progress.progress}%` }}
          />
        </div>
        {progress.articleCount && (
          <div className="absolute -top-4 right-0 text-xs">
            {progress.fetchedArticles}/{progress.articleCount}
          </div>
        )}
      </div>
    );
  };

  // Add interface for PaginationItemWithProgress props
  interface PaginationItemWithProgressProps extends React.PropsWithChildren {
    page: number;
    className?: string;
  }

  // Update the component definition
  const PaginationItemWithProgress = ({
    page,
    children,
    className,
  }: PaginationItemWithProgressProps) => (
    <PaginationItem className={cn('relative', className)}>
      {children}
      {renderPageProgress(page)}
    </PaginationItem>
  );

  const renderUrlLogs = () => (
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
                      <code className="overflow-hidden text-xs text-ellipsis whitespace-nowrap text-muted-foreground">
                        {log.url}
                      </code>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </time>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center">
                <span className="text-sm text-muted-foreground">
                  No URLs fetched yet
                </span>
              </div>
            )}
          </div>

          {loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {syncStatus}
                </span>
                <span className="text-sm font-medium">{syncProgress}%</span>
              </div>
              <Progress value={syncProgress} className="h-2" />
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Page Progress</h4>
            <div className="grid gap-2">
              {pageProgresses.map((progress) => (
                <div key={progress.pageNumber} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      Page {progress.pageNumber}
                      {progress.articleCount
                        ? ` (${progress.fetchedArticles}/${progress.articleCount} articles)`
                        : ''}
                    </span>
                    <Badge variant={getStatusVariant(progress.status)}>
                      {progress.status}
                    </Badge>
                  </div>
                  <Progress value={progress.progress} className="h-2" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'complete':
        return 'success';
      case 'error':
        return 'destructive';
      case 'processing':
        return 'default';
      case 'fetching':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const updateUrlProgress = (
    url: string,
    progress: number,
    subStatus?: string
  ) => {
    setUrlQueue((prev) => {
      const newQueue = [...prev];
      const index = newQueue.findIndex((item) => item.url === url);
      if (index >= 0 && newQueue[index]) {
        newQueue[index] = {
          ...newQueue[index],
          progress,
          subStatus,
        };
      }

      // Calculate global progress based on all queue items
      const totalProgress = newQueue.reduce((sum, item) => {
        return sum + (item.status === 'completed' ? 100 : item.progress);
      }, 0);
      const globalProgress = Math.round(
        (totalProgress / (newQueue.length * 100)) * 100
      );
      setSyncProgress(globalProgress);

      return newQueue;
    });
  };

  const renderQueueCard = () => (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">URL Queue</h3>
            <Badge variant="outline">
              {urlQueue.filter((i) => i.status === 'pending').length} pending
            </Badge>
          </div>
          <div className="max-h-[200px] space-y-2 overflow-y-auto">
            {urlQueue.map((item, index) => (
              <div
                key={index}
                className={cn(
                  'space-y-2 rounded-md border p-2',
                  item.status === 'processing' && 'bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {item.status === 'pending' && (
                      <Clock className="h-4 w-4 text-muted-foreground" />
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
                    <code className="flex-1 truncate text-xs text-muted-foreground">
                      {item.url}
                    </code>
                  </div>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </time>
                </div>
                {(item.status === 'processing' || item.progress > 0) && (
                  <div className="space-y-1">
                    {item.subStatus && (
                      <div className="text-xs text-muted-foreground">
                        {item.subStatus}
                      </div>
                    )}
                    <Progress value={item.progress} className="h-1" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const syncWithBackend = async (data: any[]) => {
    try {
      const BATCH_SIZE = 100;
      let processedBatches = 0;
      let processedRows = 0;

      // Process data in batches
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        if (crawlState === 'paused') {
          throw new Error('Sync paused by user');
        }

        const batch = data.slice(i, i + BATCH_SIZE);
        processedBatches++;
        processedRows += batch.length;

        const response = await fetch(
          `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/rows`,
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
            `Failed to sync batch ${processedBatches}: ${response.statusText}`
          );
        }

        // Update sync progress
        const progress = (processedRows / data.length) * 100;
        setSyncProgress(progress);
        setSyncStatus(
          `Syncing data... (${processedRows.toLocaleString()} of ${data.length.toLocaleString()} rows)`
        );
      }

      setSyncStatus(
        `Successfully synced ${data.length.toLocaleString()} rows!`
      );
      setSyncProgress(100);
    } catch (error) {
      console.error('Error syncing with backend:', error);
      setSyncStatus(
        'Error syncing data: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
      throw error;
    }
  };

  const startCrawl = async () => {
    try {
      setCrawlState('running');
      setSyncStatus('Starting crawl process...');
      setLoading(true);

      // Reset all metrics at start
      setMetrics({
        startTime: Date.now(),
        totalPages: 0,
        completedPages: 0,
        totalArticles: 0,
        processedArticles: 0,
        requestCount: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageRequestTime: 0,
        estimatedTimeLeft: '--:--',
      });

      // Reset progress states
      setPageProgresses([]);
      setUrlLogs([]);
      setUrlQueue([]);
      setSyncProgress(0);

      if (!dataset?.url) {
        throw new Error('No URL provided');
      }

      if (!dataset?.id) {
        throw new Error('No dataset ID provided');
      }

      if (
        !dataset?.type ||
        !['html', 'excel', 'csv'].includes(dataset.type as string)
      ) {
        throw new Error('Invalid dataset type');
      }

      // At this point, we know dataset exists and has required properties
      const validatedDataset = dataset as {
        id: string;
        url: string;
        type: 'html' | 'excel' | 'csv';
        html_ids?: string[];
      };

      if (validatedDataset.type === 'html') {
        if (
          !validatedDataset.html_ids ||
          !Array.isArray(validatedDataset.html_ids) ||
          validatedDataset.html_ids.length === 0
        ) {
          throw new Error('No HTML IDs provided');
        }

        const crawler = new HtmlCrawler();
        const htmlData = await crawler.crawl({
          url: validatedDataset.url,
          htmlIds: validatedDataset.html_ids,
          maxPages: maxPages ? Number(maxPages) : undefined,
          maxArticles: maxArticles ? Number(maxArticles) : undefined,
          onProgress: (progress, status) => {
            if (crawlState === 'paused') return;
            setSyncProgress(progress);
            setSyncStatus(status);
          },
          onUrlFetch: handleUrlFetch,
          onQueueUpdate: handleQueueUpdate,
          onUrlProgress: updateUrlProgress,
          onPageProgress: handlePageProgress,
          onTotalPages: (pages) => {
            setTotalPages(pages);
            setMetrics((prev) => ({
              ...prev,
              totalPages: pages,
            }));
          },
        });

        // Extract unique column names from HTML IDs
        const uniqueHeaders = validatedDataset.html_ids.map((id) => {
          const match = id.match(/{{(.+?)}}/);
          return match ? match[1]?.trim() : `Column ${id}`;
        });

        // Sync columns first
        setSyncStatus('Syncing columns...');
        const columnsResponse = await fetch(
          `/api/v1/workspaces/${wsId}/datasets/${validatedDataset.id}/columns/sync`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              columns: uniqueHeaders.map((header) => ({
                name: header,
                type: 'text',
              })),
            }),
          }
        );

        if (!columnsResponse.ok) {
          throw new Error('Failed to sync columns');
        }

        // Process and sync data in batches
        if (htmlData?.length > 0) {
          setSyncStatus(`Starting sync of ${htmlData.length} rows...`);
          const BATCH_SIZE = 100;

          for (let i = 0; i < htmlData.length; i += BATCH_SIZE) {
            if (crawlState === 'paused') {
              throw new Error('Sync paused by user');
            }

            const batch = htmlData.slice(i, i + BATCH_SIZE);
            const response = await fetch(
              `/api/v1/workspaces/${wsId}/datasets/${validatedDataset.id}/rows/sync`,
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
              ((i + batch.length) / htmlData.length) * 100,
              100
            );
            setSyncProgress(progress);
            setSyncStatus(
              `Syncing data... (${i + batch.length} of ${htmlData.length} rows)`
            );
          }
        }

        setCrawlState('completed');
        setSyncStatus('Crawl completed successfully!');

        queryClient.invalidateQueries({
          queryKey: [
            wsId,
            validatedDataset.id,
            'rows',
            { currentPage: 1, pageSize: '10' },
          ],
        });
      } else if (
        validatedDataset.type === 'excel' ||
        validatedDataset.type === 'csv'
      ) {
        const crawler = validatedDataset.url.toLowerCase().endsWith('.csv')
          ? new CsvCrawler()
          : new ExcelCrawler();

        setSyncStatus('Fetching file data...');
        const { headers, data } = await crawler.crawl({
          url: validatedDataset.url,
          headerRow: parseInt(form.getValues('headerRow') || '1'),
          dataStartRow: parseInt(form.getValues('dataRow') || '2'),
          onProgress: (progress, status) => {
            if (crawlState === 'paused') return;
            setSyncProgress(progress);
            setSyncStatus(status);
          },
        });

        if (!data || data.length === 0) {
          throw new Error('No data found in the file');
        }

        setSyncStatus('Processing data for sync...');

        // Convert data to the expected format
        const formattedData = data.map((row: any[]) => {
          const rowData: Record<string, any> = {};
          headers.forEach((header: string, index: number) => {
            // Preserve the original value type (number, string, etc.)
            rowData[header] = row[index] !== undefined ? row[index] : '';
          });
          return rowData;
        });

        // Process and sync data
        if (formattedData.length > 0) {
          setSyncStatus(`Starting sync of ${formattedData.length} rows...`);
          await syncWithBackend(formattedData);
        }

        setCrawlState('completed');
        setSyncStatus(
          validatedDataset.type === 'csv'
            ? 'CSV data synced successfully!'
            : 'Excel data synced successfully!'
        );

        queryClient.invalidateQueries({
          queryKey: [
            wsId,
            validatedDataset.id,
            'rows',
            { currentPage: 1, pageSize: '10' },
          ],
        });
      }
    } catch (error) {
      console.error('Error during crawl:', error);
      setCrawlState('idle');
      setSyncStatus(
        'Crawl failed: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePageProgress = (progress: PageProgress) => {
    if (crawlState === 'paused') return;

    setPageProgresses((prev) => {
      const newProgresses = [...prev];
      const index = newProgresses.findIndex(
        (p) => p.pageNumber === progress.pageNumber
      );

      if (index >= 0) {
        newProgresses[index] = progress;
      } else {
        newProgresses.push(progress);
      }

      // Update metrics with correct calculations
      const completedPages = newProgresses.filter(
        (p) => p.status === 'complete'
      ).length;
      const totalArticles = newProgresses.reduce(
        (sum, p) => sum + (p.articleCount || 0),
        0
      );
      const processedArticles = newProgresses.reduce(
        (sum, p) => sum + (p.fetchedArticles || 0),
        0
      );

      setMetrics((prev) => {
        const elapsed = Date.now() - prev.startTime;
        const avgRequestTime = prev.requestCount
          ? elapsed / prev.requestCount
          : 0;

        return {
          ...prev,
          completedPages,
          totalPages: Math.max(prev.totalPages, newProgresses.length),
          totalArticles: Math.max(prev.totalArticles, totalArticles),
          processedArticles,
          averageRequestTime: avgRequestTime,
          estimatedTimeLeft: calculateEstimatedTime(
            completedPages,
            prev.totalPages,
            prev.startTime
          ),
        };
      });

      return newProgresses;
    });
  };

  const handleUrlFetch = (
    url: string,
    success: boolean,
    subPages?: { total: number; processed: number }
  ) => {
    if (crawlState === 'paused') return;

    const timestamp = Date.now();
    const urlWithProgress: UrlWithProgress = {
      url,
      status: success ? 'completed' : 'failed',
      timestamp,
      progress: success ? 100 : 0,
      subPages,
    };

    setRecentFetches((prev) => [...prev.slice(-4), urlWithProgress]);
    setPendingUrls((prev) => prev.filter((item) => item.url !== url));

    setUrlLogs((prev) => [...prev, { url, success, timestamp }]);
    setActiveUrl(url);

    setMetrics((prev) => {
      const elapsed = timestamp - prev.startTime;
      const requestCount = prev.requestCount + 1;
      const successfulRequests = prev.successfulRequests + (success ? 1 : 0);
      const failedRequests = prev.failedRequests + (success ? 0 : 1);
      const avgRequestTime = elapsed / requestCount;

      return {
        ...prev,
        requestCount,
        successfulRequests,
        failedRequests,
        averageRequestTime: avgRequestTime,
      };
    });
  };

  const stopCrawl = () => {
    // Cancel all active fetches
    activeFetchesRef.current.forEach((fetch) => {
      fetch.controller.abort();
    });
    activeFetchesRef.current = [];

    // Clear queues
    setPendingUrls([]);
    setUrlQueue([]);
    setCrawlState('idle');
    setSyncStatus('Crawl stopped');
  };

  const renderMetricsAndQueues = () => (
    <div className="grid gap-4 md:grid-cols-2">
      <RecentFetchesCard recentFetches={recentFetches} />
      <PendingUrlsCard pendingUrls={pendingUrls} />
    </div>
  );

  const handleQueueUpdate = (urls: string[]) => {
    if (crawlState === 'paused') return;
    const queueItems = urls.map((url) => ({
      url,
      status: 'pending' as const,
      timestamp: Date.now(),
      progress: 0,
    }));
    setUrlQueue(queueItems);
    setPendingUrls(queueItems);
  };

  const loadExcelFile = async () => {
    if (!dataset.url) return;

    try {
      setLoading(true);
      setExcelError(null);
      setSyncStatus('Loading file...');

      const crawler = dataset.url.toLowerCase().endsWith('.csv')
        ? new CsvCrawler()
        : new ExcelCrawler();

      const { data, sheetInfo } = await crawler.preloadFile(dataset.url);

      setWorkbook(data);
      setSheetInfo(sheetInfo);
      setIsFileLoaded(true);
      setSyncStatus('File loaded. Configure import settings below.');

      // Set default values for form
      form.setValue('headerRow', '1');
      form.setValue('dataRow', '2');
      updatePreview(data, sheetInfo.name, 1, 2);
    } catch (error) {
      setExcelError(
        error instanceof Error ? error.message : 'Failed to load file'
      );
      setSyncStatus('Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const updatePreview = (
    data: any[][] | XLSX.WorkBook,
    sheetName: string,
    headerRow: number,
    dataRow: number
  ) => {
    let preview;
    if (dataset.url?.toLowerCase().endsWith('.csv')) {
      const csvCrawler = new CsvCrawler();
      preview = csvCrawler.getPreviewFromData(
        data as any[][],
        headerRow,
        dataRow
      );
    } else {
      const excelCrawler = new ExcelCrawler();
      preview = excelCrawler.getPreviewFromWorkbook(
        data,
        sheetName,
        headerRow,
        dataRow
      );
    }

    if (preview.error) {
      setExcelError(preview.error);
    } else {
      setExcelError(null);
    }

    setProcessedData([preview.headers, ...preview.preview]);
  };

  const handleConfigChange = () => {
    if (!workbook || !sheetInfo.name) return;

    const headerRow = parseInt(form.getValues('headerRow') || '1');
    const dataRow = parseInt(form.getValues('dataRow') || '2');

    updatePreview(workbook, sheetInfo.name, headerRow, dataRow);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button onClick={() => setIsOpen(true)} disabled={!dataset.url}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {dataset.type === 'html' ? 'Start Crawler' : 'Sync Dataset'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-[90vw]">
        {renderDialogContent()}
      </DialogContent>
    </Dialog>
  );
}
