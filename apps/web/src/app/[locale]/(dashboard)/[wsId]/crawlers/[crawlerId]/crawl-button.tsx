'use client';

import { Button } from '@ncthub/ui/button';
import { useToast } from '@ncthub/ui/hooks/use-toast';
import { BugPlay, ExternalLink, Loader2, RefreshCw } from '@ncthub/ui/icons';
import { Progress } from '@ncthub/ui/progress';
import { cn } from '@ncthub/utils/format';
import { useState } from 'react';

export default function CrawlButton({
  wsId,
  url,
  originUrl,
  isCrawled,
  onCrawlComplete,
}: {
  wsId: string;
  url: string;
  originUrl?: string;
  isCrawled?: boolean;
  onCrawlComplete?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleCrawl = async () => {
    if (loading) return;

    setLoading(true);
    setProgress(0);
    setSuccess(false);

    try {
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + Math.random() * 20, 90));
      }, 500);

      const res = await fetch(`/api/v1/workspaces/${wsId}/crawl`, {
        method: 'POST',
        body: JSON.stringify({ url, originUrl }),
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!res.ok) throw new Error('Failed to crawl URL');

      setSuccess(true);
      onCrawlComplete?.();

      toast({
        title: 'URL crawled successfully',
        description: (
          <div className="flex flex-col gap-1 truncate">
            <span className="truncate">{url}</span>
            {originUrl && (
              <span className="text-muted-foreground truncate text-xs">
                From: {originUrl}
              </span>
            )}
          </div>
        ),
      });
    } catch (err) {
      setProgress(0);
      toast({
        variant: 'destructive',
        title: 'Failed to crawl URL',
        description: 'Please try again later',
      });
      console.error('Error crawling URL:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isCrawled ? 'outline' : 'ghost'}
        size="sm"
        onClick={handleCrawl}
        disabled={loading}
        className={cn(
          'relative min-w-24',
          success && 'text-green-500 hover:text-green-500',
          loading && 'text-blue-500 hover:text-blue-500',
          isCrawled && !loading && 'text-green-500 hover:text-green-500'
        )}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {progress < 100 ? 'Crawling...' : 'Processing...'}
          </>
        ) : isCrawled ? (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            Recrawl
          </>
        ) : (
          <>
            <BugPlay className="mr-2 h-4 w-4" />
            Crawl
          </>
        )}
        {loading && (
          <Progress
            value={progress}
            className="absolute bottom-0 left-0 h-0.5 w-full rounded-none bg-transparent"
          />
        )}
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open URL"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </Button>
    </div>
  );
}
