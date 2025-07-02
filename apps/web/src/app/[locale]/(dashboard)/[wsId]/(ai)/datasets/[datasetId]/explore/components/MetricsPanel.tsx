import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import type { CrawlMetrics } from '../types';
import { formatDuration, formatTime } from '../utils/time';

interface Props {
  metrics: CrawlMetrics;
  crawlState: string;
}

export function MetricsPanel({ metrics, crawlState }: Props) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Crawl Progress */}
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

            {/* Articles Found */}
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
              <div className="text-sm text-muted-foreground">
                {(
                  (metrics.processedArticles /
                    Math.max(metrics.totalArticles, 1)) *
                  100
                ).toFixed(1)}
                % complete
              </div>
            </div>

            {/* Request Stats */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Request Stats</h4>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{metrics.requestCount}</div>
                <Badge
                  variant={
                    metrics.failedRequests === 0 ? 'success' : 'destructive'
                  }
                >
                  {metrics.failedRequests} failed
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {metrics.averageRequestTime.toFixed(0)}ms average
              </div>
            </div>

            {/* Time Stats */}
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
              <div className="text-sm text-muted-foreground">
                Started {formatTime(metrics.startTime)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Page Progress */}
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
                    (metrics.completedPages / Math.max(metrics.totalPages, 1)) *
                    100
                  }
                  className="h-2"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Request Performance */}
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
}
