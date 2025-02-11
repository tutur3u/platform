'use client';

import CrawlButton from './crawl-button';
import { formatHTML, unescapeMarkdownString } from './utils';
import { MemoizedReactMarkdown } from '@/components/markdown';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tutur3u/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tutur3u/ui/tabs';
import { formatDistance } from 'date-fns';
import { useEffect, useState } from 'react';

interface CrawledUrl {
  created_at: string;
  html: string | null;
  id: string;
  markdown: string | null;
  url: string;
}

interface RelatedUrl {
  created_at: string;
  origin_id: string;
  skipped: boolean;
  url: string;
}

export function CrawlerContent({
  initialCrawledUrl,
  initialRelatedUrls,
  wsId,
  url,
}: {
  initialCrawledUrl: CrawledUrl | null;
  initialRelatedUrls: RelatedUrl[];
  wsId: string;
  url: string;
}) {
  const [crawledUrl, setCrawledUrl] = useState(initialCrawledUrl);
  const [relatedUrls, setRelatedUrls] = useState(initialRelatedUrls);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshData = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/crawlers/status?url=${encodeURIComponent(url)}`
      );
      if (!res.ok) return;

      const data = await res.json();
      setCrawledUrl(data.crawledUrl);
      setRelatedUrls(data.relatedUrls || []);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (crawledUrl) {
      const interval = setInterval(refreshData, 5000);
      return () => clearInterval(interval);
    }
  }, [crawledUrl]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Crawl Status</CardTitle>
              <CardDescription>
                {crawledUrl
                  ? `Last crawled ${formatDistance(new Date(crawledUrl.created_at), new Date(), { addSuffix: true })}`
                  : 'Not yet crawled'}
              </CardDescription>
            </div>
            {isRefreshing && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
          </div>
        </CardHeader>
        {!crawledUrl && (
          <CardContent>
            <CrawlButton wsId={wsId} url={url} onSuccess={refreshData} />
          </CardContent>
        )}
      </Card>

      {crawledUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Crawled Content</CardTitle>
            <CardDescription>
              View the crawled content and discovered URLs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="markdown" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
                <TabsTrigger value="html">HTML</TabsTrigger>
                <TabsTrigger value="urls">
                  URLs ({relatedUrls.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="markdown" className="mt-4">
                <div className="rounded-md border p-4">
                  {crawledUrl.markdown ? (
                    <MemoizedReactMarkdown className="prose max-w-full dark:prose-invert">
                      {unescapeMarkdownString(
                        JSON.parse(crawledUrl.markdown)?.text_content
                      )}
                    </MemoizedReactMarkdown>
                  ) : (
                    <p className="text-muted-foreground">
                      No markdown content available
                    </p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="html" className="mt-4">
                <div className="overflow-x-auto rounded-md border p-4">
                  {crawledUrl.html ? (
                    <pre className="text-sm whitespace-pre">
                      <code>{formatHTML(crawledUrl.html)}</code>
                    </pre>
                  ) : (
                    <p className="text-muted-foreground">
                      No HTML content available
                    </p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="urls" className="mt-4">
                <div className="rounded-md border">
                  {relatedUrls.length > 0 ? (
                    <div className="divide-y">
                      {relatedUrls.map((relatedUrl) => (
                        <div key={relatedUrl.url} className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  relatedUrl.skipped
                                    ? 'text-muted-foreground'
                                    : ''
                                }
                              >
                                {relatedUrl.url}
                              </span>
                              <span
                                className={`text-xs ${
                                  relatedUrl.skipped
                                    ? 'text-yellow-500'
                                    : 'text-green-500'
                                }`}
                              >
                                {relatedUrl.skipped ? 'Skipped' : 'Kept'}
                              </span>
                            </div>
                            {!relatedUrl.skipped && (
                              <CrawlButton
                                wsId={wsId}
                                url={relatedUrl.url}
                                onSuccess={refreshData}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4">
                      <p className="text-muted-foreground">
                        No URLs discovered
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </>
  );
}
