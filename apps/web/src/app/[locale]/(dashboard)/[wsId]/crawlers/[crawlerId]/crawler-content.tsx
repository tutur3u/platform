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
import Link from 'next/link';

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
  crawledUrl,
  relatedUrls,
  crawledRelatedUrls,
  wsId,
  url,
}: {
  crawledUrl: CrawledUrl | null;
  relatedUrls: RelatedUrl[];
  crawledRelatedUrls: CrawledUrl[];
  wsId: string;
  url: string;
}) {
  // Create a map of crawled URLs for quick lookup
  const crawledUrlsMap = new Map(
    crawledRelatedUrls.map((url) => [url.url, url])
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Crawl Status</CardTitle>
              <CardDescription>
                {crawledUrl?.html && crawledUrl?.markdown
                  ? `Last crawled ${formatDistance(new Date(crawledUrl.created_at), new Date(), { addSuffix: true })}`
                  : 'Not yet crawled'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        {!(crawledUrl?.html && crawledUrl?.markdown) && (
          <CardContent>
            <CrawlButton id={crawledUrl?.id} wsId={wsId} url={url} />
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
                      {relatedUrls.map((relatedUrl) => {
                        const isCrawled = crawledUrlsMap.has(relatedUrl.url);
                        const crawledData = crawledUrlsMap.get(relatedUrl.url);

                        return (
                          <div key={relatedUrl.url} className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {crawledData?.id ? (
                                  <Link
                                    href={`/${wsId}/crawlers/${crawledData.id}`}
                                    className="hover:underline"
                                  >
                                    <span
                                      className={
                                        relatedUrl.skipped
                                          ? 'text-muted-foreground'
                                          : ''
                                      }
                                    >
                                      {relatedUrl.skipped
                                        ? relatedUrl.url.replace(/\/$/, '')
                                        : relatedUrl.url}
                                    </span>
                                  </Link>
                                ) : (
                                  <span
                                    className={
                                      relatedUrl.skipped
                                        ? 'text-muted-foreground/50'
                                        : 'text-muted-foreground'
                                    }
                                  >
                                    {relatedUrl.skipped
                                      ? relatedUrl.url.replace(/\/$/, '')
                                      : relatedUrl.url}
                                  </span>
                                )}
                                <span
                                  className={`text-xs ${
                                    relatedUrl.skipped
                                      ? 'text-yellow-500'
                                      : 'text-green-500'
                                  }`}
                                >
                                  {relatedUrl.skipped ? 'Skipped' : 'Kept'}
                                </span>
                                {isCrawled && (
                                  <span className="text-xs text-blue-500">
                                    Crawled{' '}
                                    {formatDistance(
                                      new Date(crawledData!.created_at),
                                      new Date(),
                                      { addSuffix: true }
                                    )}
                                  </span>
                                )}
                              </div>
                              {!relatedUrl.skipped && !isCrawled && (
                                <CrawlButton wsId={wsId} url={relatedUrl.url} />
                              )}
                            </div>
                          </div>
                        );
                      })}
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
