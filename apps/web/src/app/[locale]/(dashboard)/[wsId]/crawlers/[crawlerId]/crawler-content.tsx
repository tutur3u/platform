'use client';

import CrawlButton from './crawl-button';
import { formatHTML, unescapeMarkdownString } from './utils';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { MemoizedReactMarkdown } from '@tuturuuu/ui/markdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { formatDistance } from 'date-fns';
import { CheckIcon, CopyIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

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
  const [copyingMarkdown, setCopyingMarkdown] = useState(false);
  const [copyingHtml, setCopyingHtml] = useState(false);

  const handleCopy = async (content: string, type: 'markdown' | 'html') => {
    try {
      await navigator.clipboard.writeText(content);
      if (type === 'markdown') setCopyingMarkdown(true);
      else setCopyingHtml(true);

      setTimeout(() => {
        if (type === 'markdown') setCopyingMarkdown(false);
        else setCopyingHtml(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Create a map of crawled URLs for quick lookup
  const crawledUrlsMap = new Map(
    crawledRelatedUrls.map((url) => [url.url, url])
  );

  // Count uncrawled URLs that weren't skipped
  const uncrawledCount = relatedUrls.filter(
    (url) => !url.skipped && !crawledUrlsMap.has(url.url)
  ).length;

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
            <CrawlButton wsId={wsId} url={url} />
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
                  URLs ({relatedUrls.length}){' '}
                  {uncrawledCount > 0 && (
                    <span className="ml-1 text-xs text-blue-500">
                      • {uncrawledCount} uncrawled
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="markdown" className="mt-4">
                <div className="rounded-md border">
                  <div className="flex items-center justify-end border-b p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (crawledUrl.markdown) {
                          const content = unescapeMarkdownString(
                            JSON.parse(crawledUrl.markdown)?.text_content
                          );
                          handleCopy(content, 'markdown');
                        }
                      }}
                      disabled={!crawledUrl.markdown}
                    >
                      {copyingMarkdown ? (
                        <CheckIcon className="h-4 w-4" />
                      ) : (
                        <CopyIcon className="h-4 w-4" />
                      )}
                      <span className="ml-2">
                        {copyingMarkdown ? 'Copied!' : 'Copy'}
                      </span>
                    </Button>
                  </div>
                  <div
                    className={cn(
                      'p-4',
                      'prose w-[calc(100vw-8rem)] min-w-full break-words text-foreground md:w-[38rem] lg:w-full dark:prose-invert prose-p:leading-relaxed prose-p:before:hidden prose-p:after:hidden prose-code:before:hidden prose-code:after:hidden prose-pre:p-2 prose-li:marker:text-foreground/80 prose-tr:border-border prose-th:border prose-th:border-b-4 prose-th:border-foreground/20 prose-th:p-2 prose-th:text-center prose-th:text-lg prose-td:border prose-td:p-2'
                    )}
                  >
                    {crawledUrl.markdown ? (
                      <MemoizedReactMarkdown>
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
                </div>
              </TabsContent>
              <TabsContent value="html" className="mt-4">
                <div className="rounded-md border">
                  <div className="flex items-center justify-end border-b p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (crawledUrl.html) {
                          handleCopy(formatHTML(crawledUrl.html), 'html');
                        }
                      }}
                      disabled={!crawledUrl.html}
                    >
                      {copyingHtml ? (
                        <CheckIcon className="h-4 w-4" />
                      ) : (
                        <CopyIcon className="h-4 w-4" />
                      )}
                      <span className="ml-2">
                        {copyingHtml ? 'Copied!' : 'Copy'}
                      </span>
                    </Button>
                  </div>
                  <div className="overflow-x-auto p-4">
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
                          <div
                            key={relatedUrl.url}
                            className={`p-4 ${!relatedUrl.skipped && !isCrawled ? 'bg-blue-500/5' : ''}`}
                          >
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
                                        : !isCrawled
                                          ? '' // Not muted if uncrawled
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
                                {isCrawled ? (
                                  <span className="text-xs text-blue-500">
                                    Crawled{' '}
                                    {formatDistance(
                                      new Date(crawledData!.created_at),
                                      new Date(),
                                      { addSuffix: true }
                                    )}
                                  </span>
                                ) : (
                                  !relatedUrl.skipped && (
                                    <span className="text-xs text-blue-500">
                                      Not yet crawled
                                    </span>
                                  )
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
