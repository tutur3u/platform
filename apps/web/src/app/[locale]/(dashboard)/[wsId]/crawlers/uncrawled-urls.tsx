'use client';

import CrawlButton from './[crawlerId]/crawl-button';
import { Alert, AlertDescription } from '@ncthub/ui/alert';
import { Button } from '@ncthub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import { Combobox } from '@ncthub/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ncthub/ui/dialog';
import { useToast } from '@ncthub/ui/hooks/use-toast';
import { AlertCircle, BugPlay, Check, Loader2 } from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
} from '@ncthub/ui/pagination';
import { Skeleton } from '@ncthub/ui/skeleton';
import { cn } from '@ncthub/utils/format';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

interface UncrawledUrl {
  created_at: string;
  origin_id: string;
  origin_url: string;
  skipped: boolean;
  url: string;
  is_crawled?: boolean;
}

interface PaginationData {
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
}

export default function UncrawledUrls({ wsId }: { wsId: string }) {
  const t = useTranslations('ws-crawlers');
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupedUrls, setGroupedUrls] = useState<
    Record<string, UncrawledUrl[]>
  >({});
  const [pagination, setPagination] = useState<PaginationData>({
    page: 1,
    pageSize: 20,
    totalPages: 1,
    totalItems: 0,
  });
  const [domains, setDomains] = useState<string[]>([]);
  const [urlSearch, setUrlSearch] = useState(searchParams.get('search') || '');
  const [isCrawlingAll, setIsCrawlingAll] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [crawledUrls, setCrawledUrls] = useState<Set<string>>(new Set());

  const currentPage = Number(searchParams.get('page')) || 1;
  const currentDomain = searchParams.get('domain') || 'all';
  const currentPageSize = Number(searchParams.get('pageSize')) || 20;

  const debouncedSearch = useDebouncedCallback((value: string) => {
    router.push(
      `${pathname}?${createQueryString({
        search: value || null,
        page: '1',
      })}`
    );
  }, 300);

  const groupUrlsByOrigin = (urls: UncrawledUrl[]) => {
    return urls.reduce(
      (acc, url) => {
        const key = url.origin_url || 'unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(url);
        return acc;
      },
      {} as Record<string, UncrawledUrl[]>
    );
  };

  useEffect(() => {
    const fetchUncrawledUrls = async () => {
      try {
        const domainsRes = await fetch(`/api/${wsId}/crawlers/domains`);
        if (!domainsRes.ok) throw new Error('Failed to fetch domains');
        const domainsData = await domainsRes.json();
        setDomains(domainsData.domains || []);

        const queryParams = new URLSearchParams(searchParams);
        if (!queryParams.has('page')) queryParams.set('page', '1');
        if (!queryParams.has('pageSize')) queryParams.set('pageSize', '20');

        const res = await fetch(
          `/api/${wsId}/crawlers/uncrawled?${queryParams}`
        );
        if (!res.ok) throw new Error('Failed to fetch uncrawled URLs');

        const data = await res.json();
        setGroupedUrls(groupUrlsByOrigin(data.urls));
        setPagination(data.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchUncrawledUrls();
  }, [wsId, searchParams]);

  const createQueryString = (params: Record<string, string | null>) => {
    const newSearchParams = new URLSearchParams(searchParams);
    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        newSearchParams.delete(key);
      } else {
        newSearchParams.set(key, value);
      }
    });
    return newSearchParams.toString();
  };

  const handleCrawlAll = async () => {
    setIsCrawlingAll(true);
    setShowConfirmDialog(false);
    let successCount = 0;
    let failCount = 0;

    try {
      await Promise.all(
        Object.values(groupedUrls)
          .flat()
          .map(async (url) => {
            try {
              const res = await fetch(`/api/v1/workspaces/${wsId}/crawl`, {
                method: 'POST',
                body: JSON.stringify({ url: url.url }),
              });
              if (!res.ok) throw new Error();
              successCount++;
            } catch {
              failCount++;
            }
          })
      );

      toast({
        title: 'Bulk crawl completed',
        description: `Successfully crawled ${successCount} URLs${failCount > 0 ? `, ${failCount} failed` : ''}`,
        variant: failCount > 0 ? 'destructive' : 'default',
      });

      router.refresh();
    } catch (err) {
      console.error('Error in bulk crawl:', err);
    } finally {
      setIsCrawlingAll(false);
    }
  };

  const pageSizeOptions = [
    { value: '10', label: '10 per page' },
    { value: '20', label: '20 per page' },
    { value: '50', label: '50 per page' },
    { value: '100', label: '100 per page' },
  ];

  const comboboxOptions = [
    { value: 'all', label: 'All Domains' },
    ...domains.map((domain) => ({ value: domain, label: domain })),
  ];

  useEffect(() => {
    const fetchCrawlStatus = async () => {
      try {
        const urls = Object.values(groupedUrls)
          .flat()
          .map((u) => u.url);
        if (urls.length === 0) return;

        const res = await fetch(`/api/${wsId}/crawlers/status`, {
          method: 'POST',
          body: JSON.stringify({ urls }),
        });

        if (!res.ok) throw new Error('Failed to fetch crawl status');
        const data = await res.json();
        setCrawledUrls(new Set(data.crawledUrls));
      } catch (err) {
        console.error('Error fetching crawl status:', err);
      }
    };

    fetchCrawlStatus();
  }, [wsId, groupedUrls]);

  useEffect(() => {
    const eventSource = new EventSource(`/api/${wsId}/crawlers/events`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'url_crawled') {
        setCrawledUrls((prev) => new Set([...prev, data.url]));
        router.refresh();
      }
    };

    return () => eventSource.close();
  }, [wsId, router]);

  const renderUrlItem = (url: UncrawledUrl) => {
    const urlObj = new URL(url.url);
    const isCrawled = crawledUrls.has(url.url);

    return (
      <div
        key={url.url}
        className={cn(
          'flex items-center justify-between rounded-md p-4',
          isCrawled ? 'bg-muted/30' : 'bg-muted/50'
        )}
      >
        <div className="flex flex-col gap-1.5 overflow-hidden">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">
              {urlObj.pathname === '/' ? urlObj.hostname : urlObj.pathname}
            </span>
            {urlObj.searchParams.toString() && (
              <span className="bg-muted-foreground/10 text-muted-foreground max-w-[300px] truncate rounded-full px-2 py-0.5 text-xs">
                ?{urlObj.searchParams.toString()}
              </span>
            )}
            {isCrawled && (
              <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
                Crawled
              </span>
            )}
          </div>
          <a
            href={url.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground truncate text-sm"
          >
            {url.url}
          </a>
        </div>
        <div className="shrink-0">
          <CrawlButton
            wsId={wsId}
            url={url.url}
            originUrl={
              url.origin_url !== 'unknown' ? url.origin_url : undefined
            }
            isCrawled={isCrawled}
            onCrawlComplete={() => {
              setCrawledUrls((prev) => new Set([...prev, url.url]));
            }}
          />
        </div>
      </div>
    );
  };

  const renderGroupHeader = (originUrl: string, urls: UncrawledUrl[]) => {
    const hostname =
      originUrl !== 'unknown' ? new URL(originUrl).hostname : 'Unknown Domain';
    const crawledCount = urls.filter((url) => crawledUrls.has(url.url)).length;
    const progress = Math.round((crawledCount / urls.length) * 100);

    return (
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{hostname}</h3>
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
              {urls.length} URL{urls.length !== 1 ? 's' : ''}
            </span>
            {crawledCount > 0 && (
              <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-500">
                {progress}% Crawled
              </span>
            )}
          </div>
          {originUrl !== 'unknown' && (
            <a
              href={originUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              {originUrl}
            </a>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            const uncrawledUrls = urls.filter(
              (url) => !crawledUrls.has(url.url)
            );
            uncrawledUrls.forEach((url) => {
              fetch(`/api/v1/workspaces/${wsId}/crawl`, {
                method: 'POST',
                body: JSON.stringify({
                  url: url.url,
                  originUrl:
                    url.origin_url !== 'unknown' ? url.origin_url : undefined,
                }),
              });
            });
          }}
          disabled={crawledCount === urls.length}
        >
          {crawledCount === urls.length ? (
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              All Crawled
            </span>
          ) : (
            `Crawl Remaining (${urls.length - crawledCount})`
          )}
        </Button>
      </div>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-4">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-6 w-32" />
                <div className="grid gap-2">
                  {[...Array(2)].map((_, j) => (
                    <Skeleton key={j} className="h-16 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!pagination.totalItems) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Uncrawled URLs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12">
            <BugPlay className="text-muted-foreground/50 h-12 w-12" />
            <p className="mt-4 text-lg font-medium">All caught up!</p>
            <p className="text-muted-foreground text-sm">
              All discovered URLs have been crawled
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle>Uncrawled URLs</CardTitle>
            <p className="text-muted-foreground text-sm">
              {pagination.totalItems} URL
              {pagination.totalItems !== 1 ? 's' : ''} waiting to be crawled
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Input
              placeholder="Search URLs..."
              value={urlSearch}
              onChange={(e) => {
                setUrlSearch(e.target.value);
                debouncedSearch(e.target.value);
              }}
              className="w-[200px]"
            />
            <Combobox
              t={t}
              options={comboboxOptions}
              selected={currentDomain}
              mode="single"
              className="w-[300px]"
              placeholder={loading ? 'Loading domains...' : 'Filter by domain'}
              onChange={(value) => {
                const selectedValue = Array.isArray(value) ? value[0] : value;
                router.push(
                  `${pathname}?${createQueryString({
                    domain: selectedValue
                      ? selectedValue === 'all'
                        ? null
                        : selectedValue
                      : null,
                    page: '1',
                  })}`
                );
              }}
            />
            <Combobox
              t={t}
              options={pageSizeOptions}
              selected={currentPageSize.toString()}
              mode="single"
              className="w-[140px]"
              onChange={(value) => {
                const selectedValue = Array.isArray(value) ? value[0] : value;
                router.push(
                  `${pathname}?${createQueryString({
                    pageSize: selectedValue || null,
                    page: '1',
                  })}`
                );
              }}
            />
            <Button
              variant="default"
              className="gap-2"
              onClick={() => setShowConfirmDialog(true)}
              disabled={isCrawlingAll}
            >
              {isCrawlingAll ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Crawling...
                </>
              ) : (
                <>
                  <BugPlay className="h-4 w-4" />
                  Crawl All
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(groupedUrls).length > 0 ? (
              <>
                <div className="bg-card divide-y rounded-md border">
                  {Object.entries(groupedUrls).map(([originUrl, urls]) => (
                    <div key={originUrl} className="p-6">
                      {renderGroupHeader(originUrl, urls)}
                      <div className="grid gap-3">
                        {urls.map(renderUrlItem)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    Showing {(currentPage - 1) * currentPageSize + 1} to{' '}
                    {Math.min(
                      currentPage * currentPageSize,
                      pagination.totalItems
                    )}{' '}
                    of {pagination.totalItems} results
                  </p>
                  <Pagination>
                    <PaginationContent>
                      {[...Array(pagination.totalPages)].map((_, i) => {
                        const page = i + 1;
                        const shouldShowPage =
                          page === 1 ||
                          page === pagination.totalPages ||
                          (page >= currentPage - 2 && page <= currentPage + 2);

                        if (!shouldShowPage) {
                          if (
                            (page === 2 && currentPage - 2 > 2) ||
                            (page === pagination.totalPages - 1 &&
                              currentPage + 2 < pagination.totalPages - 1)
                          ) {
                            return (
                              <PaginationItem key={page}>
                                <span className="flex size-9 items-center justify-center">
                                  ...
                                </span>
                              </PaginationItem>
                            );
                          }
                          return null;
                        }

                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href={`${pathname}?${createQueryString({
                                page: String(page),
                              })}`}
                              isActive={currentPage === page}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext
                          href={`${pathname}?${createQueryString({
                            page: String(currentPage + 1),
                          })}`}
                          aria-disabled={currentPage >= pagination.totalPages}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </>
            ) : (
              !loading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <p className="text-lg font-medium">No uncrawled URLs found</p>
                  <p className="text-muted-foreground text-sm">
                    All discovered URLs have been processed
                  </p>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crawl all uncrawled URLs?</DialogTitle>
            <DialogDescription>
              This will start crawling {pagination.totalItems} URLs. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleCrawlAll} className="gap-2">
              <BugPlay className="h-4 w-4" />
              Start Crawling
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
