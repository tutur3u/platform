import { Card, CardContent } from '@repo/ui/components/ui/card';

interface PerformanceMetricsProps {
  metrics: {
    tokenCount: number;
    responseTime: number;
  };
}

export function PerformanceMetrics({ metrics }: PerformanceMetricsProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Token Count
            </p>
            <p className="text-2xl font-bold">{metrics.tokenCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Response Time
            </p>
            <p className="text-2xl font-bold">{metrics.responseTime}ms</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
