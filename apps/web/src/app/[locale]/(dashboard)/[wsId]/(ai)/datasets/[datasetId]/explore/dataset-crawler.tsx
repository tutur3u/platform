'use client';

import { HtmlCrawler } from './html-crawler';
import { cn } from '@/lib/utils';
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
  Pause,
  Play,
  RefreshCw,
  ScanSearch,
  StopCircle,
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

interface QueueItem {
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: number;
  progress: number;
  subStatus?: string;
}

interface PageProgress {
  pageNumber: number;
  progress: number;
  status: 'pending' | 'fetching' | 'processing' | 'complete' | 'error';
  articleCount?: number;
  fetchedArticles?: number;
}

interface CrawlMetrics {
  startTime: number;
  totalPages: number;
  completedPages: number;
  totalArticles: number;
  processedArticles: number;
  requestCount: number;
  successfulRequests: number;
  failedRequests: number;
  averageRequestTime: number;
  estimatedTimeLeft: string;
}

interface UrlWithProgress extends QueueItem {
  subPages?: {
    total: number;
    processed: number;
  };
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

  // Calculate pagination values
  const totalRows = processedData.length - 1; // Subtract header row
  const datasetTotalPages = Math.ceil(totalRows / pageSize);
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

  const syncDataset = async () => {
    try {
      setLoading(true);
      setSyncProgress(0);
      setSyncStatus('Ready to start crawling...');
      setUrlLogs([]);
      setPageProgresses([]);

      // Initialize metrics
      setMetrics({
        startTime: 0, // Reset to 0 since we haven't started yet
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

      // Just set to idle and let user start manually
      setCrawlState('idle');
      setIsOpen(true); // Keep dialog open
      setLoading(false); // Remove loading state since we're just preparing
    } catch (error) {
      console.error('Error preparing dataset sync:', error);
      setCrawlState('idle');
      if (error instanceof Error) {
        setSyncStatus(`Failed to prepare: ${error.message}`);
      }
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
                      <span className="text-muted-foreground text-sm">
                        {syncProgress}% Complete
                      </span>
                    </div>

                    <Progress value={syncProgress} className="h-2" />

                    {activeUrl && (
                      <div className="flex items-center gap-2 rounded-md border p-2">
                        <RefreshCw className="h-4 w-4 flex-none animate-spin" />
                        <code className="text-muted-foreground line-clamp-1 w-full text-xs">
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
              <div className="text-muted-foreground text-sm">
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
            <CrawlControls />
            <div className="text-muted-foreground text-sm">{syncStatus}</div>
          </div>
        )}

        {/* Show metrics panel when crawling */}
        {crawlState !== 'idle' && dataset.type === 'html' && (
          <>
            <MetricsPanel metrics={metrics} />
            {renderMetricsAndQueues()}
          </>
        )}

        {/* Existing content */}
        {dataset.type === 'html' ? (
          renderHtmlPreview()
        ) : (
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
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
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
                        <FormDescription>
                          Leave blank for no header
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
                          <Input placeholder="2" {...field} />
                        </FormControl>
                        <FormDescription>1-based row index</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
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
                          {processedData[0]?.map(
                            (header: any, index: number) => (
                              <th
                                key={index}
                                className="border-foreground/30 border px-4 py-2"
                              >
                                {header}
                              </th>
                            )
                          )}
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
                    <PaginationItemWithProgress page={currentPage - 1}>
                      <PaginationPrevious
                        href={getPageHref(currentPage - 1)}
                        onClick={(e) => handlePageClick(e, currentPage - 1)}
                        className={
                          currentPage === 1
                            ? 'pointer-events-none opacity-50'
                            : ''
                        }
                      />
                    </PaginationItemWithProgress>

                    {Array.from({ length: datasetTotalPages }, (_, i) => i + 1)
                      .filter(
                        (page) =>
                          page === 1 ||
                          page === datasetTotalPages ||
                          (page >= currentPage - 1 && page <= currentPage + 1)
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
                              isActive={page === currentPage}
                            >
                              {page}
                            </PaginationLink>
                            {renderPageProgress(page)}
                          </PaginationItemWithProgress>
                        );
                      })}

                    <PaginationItemWithProgress page={currentPage + 1}>
                      <PaginationNext
                        href={getPageHref(currentPage + 1)}
                        onClick={(e) => handlePageClick(e, currentPage + 1)}
                        className={
                          currentPage === datasetTotalPages
                            ? 'pointer-events-none opacity-50'
                            : ''
                        }
                      />
                    </PaginationItemWithProgress>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </>
    );
  };

  const renderPageProgress = (page: number) => {
    const progress = pageProgresses.find((p) => p.pageNumber === page);
    if (!progress) return null;

    return (
      <div className="absolute inset-x-0 -bottom-1">
        <div className="bg-muted relative h-1 w-full overflow-hidden rounded-full">
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
                  </div>
                  <time className="text-muted-foreground shrink-0 text-xs">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </time>
                </div>
                {(item.status === 'processing' || item.progress > 0) && (
                  <div className="space-y-1">
                    {item.subStatus && (
                      <div className="text-muted-foreground text-xs">
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

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '--:--';
    return new Date(timestamp).toLocaleTimeString();
  };

  const calculateEstimatedTime = (
    completedPages: number,
    totalPages: number,
    startTime: number
  ) => {
    if (completedPages === 0 || !startTime) return '--:--';

    const elapsed = Date.now() - startTime;
    const avgTimePerPage = elapsed / completedPages;
    const remainingPages = totalPages - completedPages;
    const estimatedRemaining = avgTimePerPage * remainingPages;

    return formatDuration(Math.max(0, estimatedRemaining));
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

      if (dataset.type === 'html' && dataset?.html_ids?.length) {
        const crawler = new HtmlCrawler();
        const htmlData = await crawler.crawl({
          url: dataset.url!,
          htmlIds: dataset.html_ids,
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

        // Process and sync data
        if (htmlData?.length > 0) {
          await syncWithBackend(htmlData);
        }

        setCrawlState('completed');
        setSyncStatus('Crawl completed successfully!');
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

  const syncWithBackend = async (htmlData: any[]) => {
    // Get column names from HTML IDs
    const columnNames = dataset.html_ids
      ?.map((id) => {
        const match = id.match(/{{(.+?)}}/);
        return match ? match[1] : '';
      })
      .filter(Boolean);

    // Sync columns
    const columnsToSync = columnNames?.map((name) => ({ name }));
    await fetch(
      `/api/v1/workspaces/${wsId}/datasets/${dataset.id}/columns/sync`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: columnsToSync }),
      }
    );

    // Sync rows
    await fetch(`/api/v1/workspaces/${wsId}/datasets/${dataset.id}/rows/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: htmlData }),
    });
  };

  const CrawlControls = () => {
    const canPause = crawlState === 'running';
    const canResume = crawlState === 'paused';
    const canStart = crawlState === 'idle';
    const canStop = ['running', 'paused'].includes(crawlState);

    return (
      <div className="flex items-center gap-2">
        {canStart && (
          <Button onClick={startCrawl} variant="default">
            <Play className="mr-2 h-4 w-4" />
            Start Crawling
          </Button>
        )}

        {canPause && (
          <Button onClick={() => setCrawlState('paused')} variant="outline">
            <Pause className="mr-2 h-4 w-4" />
            Pause
          </Button>
        )}

        {canResume && (
          <Button onClick={() => setCrawlState('running')} variant="outline">
            <Play className="mr-2 h-4 w-4" />
            Resume
          </Button>
        )}

        {canStop && (
          <Button onClick={stopCrawl} variant="destructive">
            <StopCircle className="mr-2 h-4 w-4" />
            Stop
          </Button>
        )}
      </div>
    );
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

  const MetricsPanel = ({ metrics }: { metrics: CrawlMetrics }) => {
    return (
      <div className="grid gap-4">
        {/* Overview Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Crawl Progress</h4>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold">
                    {(
                      (metrics.processedArticles /
                        Math.max(metrics.totalArticles, 1)) *
                      100
                    ).toFixed(1)}
                    %
                  </div>
                  <Badge
                    variant={crawlState === 'running' ? 'default' : 'outline'}
                  >
                    {crawlState}
                  </Badge>
                </div>
                <Progress
                  value={
                    (metrics.processedArticles /
                      Math.max(metrics.totalArticles, 1)) *
                    100
                  }
                  className="h-2"
                />
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Articles Found</h4>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold">
                    {metrics.totalArticles}
                  </div>
                  <Badge variant="outline">
                    {metrics.processedArticles} processed
                  </Badge>
                </div>
                <div className="text-muted-foreground text-sm">
                  {(
                    (metrics.processedArticles /
                      Math.max(metrics.totalArticles, 1)) *
                    100
                  ).toFixed(1)}
                  % complete
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Request Stats</h4>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold">
                    {metrics.requestCount}
                  </div>
                  <Badge
                    variant={
                      metrics.failedRequests === 0 ? 'success' : 'destructive'
                    }
                  >
                    {metrics.failedRequests} failed
                  </Badge>
                </div>
                <div className="text-muted-foreground text-sm">
                  {metrics.averageRequestTime.toFixed(0)}ms average
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-medium">Time Stats</h4>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold">
                    {formatDuration(Date.now() - metrics.startTime)}
                  </div>
                  <Badge variant="outline">
                    {metrics.estimatedTimeLeft} left
                  </Badge>
                </div>
                <div className="text-muted-foreground text-sm">
                  Started {formatTime(metrics.startTime)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Stats */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <h4 className="font-medium">Page Progress</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold">
                      {metrics.completedPages}/{metrics.totalPages}
                    </div>
                    <Badge variant="outline">
                      {(
                        (metrics.completedPages /
                          Math.max(metrics.totalPages, 1)) *
                        100
                      ).toFixed(1)}
                      %
                    </Badge>
                  </div>
                  <Progress
                    value={
                      (metrics.completedPages /
                        Math.max(metrics.totalPages, 1)) *
                      100
                    }
                    className="h-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <h4 className="font-medium">Request Performance</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold">
                      {metrics.successfulRequests}/{metrics.requestCount}
                    </div>
                    <Badge
                      variant={
                        metrics.failedRequests === 0 ? 'success' : 'destructive'
                      }
                    >
                      {(
                        (metrics.successfulRequests /
                          Math.max(metrics.requestCount, 1)) *
                        100
                      ).toFixed(1)}
                      % success
                    </Badge>
                  </div>
                  <Progress
                    value={
                      (metrics.successfulRequests /
                        Math.max(metrics.requestCount, 1)) *
                      100
                    }
                    className="h-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const RecentFetchesCard = () => (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Recent Fetches</h3>
            <Badge variant="outline">{recentFetches.length} urls</Badge>
          </div>
          <div className="space-y-2">
            {recentFetches.slice(-5).map((item, index) => (
              <div
                key={index}
                className={cn(
                  'space-y-2 rounded-md border p-2',
                  item.status === 'processing' && 'bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {item.status === 'completed' && (
                      <Check className="h-4 w-4 text-green-500" />
                    )}
                    {item.status === 'failed' && (
                      <X className="h-4 w-4 text-red-500" />
                    )}
                    <code className="text-muted-foreground flex-1 truncate text-xs">
                      {item.url}
                    </code>
                  </div>
                </div>
                {item.subPages && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {item.subPages.processed} / {item.subPages.total} pages
                    </span>
                    <Progress
                      value={
                        (item.subPages.processed / item.subPages.total) * 100
                      }
                      className="h-1 w-24"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const PendingUrlsCard = () => (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Pending URLs</h3>
            <Badge variant="outline">{pendingUrls.length} remaining</Badge>
          </div>
          <div className="space-y-2">
            {pendingUrls.slice(0, 5).map((item, index) => (
              <div key={index} className="rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="text-muted-foreground h-4 w-4" />
                    <code className="text-muted-foreground flex-1 truncate text-xs">
                      {item.url}
                    </code>
                  </div>
                </div>
              </div>
            ))}
            {pendingUrls.length > 5 && (
              <div className="text-muted-foreground text-center text-sm">
                +{pendingUrls.length - 5} more URLs
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderMetricsAndQueues = () => (
    <div className="grid gap-4 md:grid-cols-2">
      <RecentFetchesCard />
      <PendingUrlsCard />
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

        {/* Only show sync button for non-HTML datasets */}
        {dataset.type !== 'html' && (
          <div className="mt-4 flex justify-end">
            <Button onClick={syncDataset} disabled={loading}>
              {loading ? 'Syncing...' : 'Sync Dataset'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
