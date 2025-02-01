import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import { Pause, Play, StopCircle } from 'lucide-react';

interface Props {
  crawlState: 'idle' | 'running' | 'paused' | 'completed';
  maxPages?: string;
  maxArticles?: string;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  // eslint-disable-next-line no-unused-vars
  onMaxPagesChange: (value: string) => void;
  // eslint-disable-next-line no-unused-vars
  onMaxArticlesChange: (value: string) => void;
}

export function CrawlControls({
  crawlState,
  maxPages,
  maxArticles,
  onStart,
  onPause,
  onResume,
  onStop,
  onMaxPagesChange,
  onMaxArticlesChange,
}: Props) {
  const canPause = crawlState === 'running';
  const canResume = crawlState === 'paused';
  const canStart = crawlState === 'idle';
  const canStop = ['running', 'paused'].includes(crawlState);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {canStart && (
          <Button onClick={onStart} variant="default">
            <Play className="mr-2 h-4 w-4" />
            Start Crawling
          </Button>
        )}

        {canPause && (
          <Button onClick={onPause} variant="outline">
            <Pause className="mr-2 h-4 w-4" />
            Pause
          </Button>
        )}

        {canResume && (
          <Button onClick={onResume} variant="outline">
            <Play className="mr-2 h-4 w-4" />
            Resume
          </Button>
        )}

        {canStop && (
          <Button onClick={onStop} variant="destructive">
            <StopCircle className="mr-2 h-4 w-4" />
            Stop
          </Button>
        )}
      </div>

      <form className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="No limit"
            className="w-24"
            value={maxPages || ''}
            onChange={(e) => onMaxPagesChange(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">Max Pages</span>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="No limit"
            className="w-24"
            value={maxArticles || ''}
            onChange={(e) => onMaxArticlesChange(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">Max Articles</span>
        </div>
      </form>
    </div>
  );
}
