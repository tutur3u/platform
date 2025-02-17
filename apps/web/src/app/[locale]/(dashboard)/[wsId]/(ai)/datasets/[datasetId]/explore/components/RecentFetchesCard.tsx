import type { UrlWithProgress } from '../types';
import { cn } from '@tutur3u/utils/format';
import { Badge } from '@tutur3u/ui/badge';
import { Card, CardContent } from '@tutur3u/ui/card';
import { Progress } from '@tutur3u/ui/progress';
import { Check, X } from 'lucide-react';

interface Props {
  recentFetches: UrlWithProgress[];
}

export function RecentFetchesCard({ recentFetches }: Props) {
  return (
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
                      <Check className="h-4 w-4 flex-none text-green-500" />
                    )}
                    {item.status === 'failed' && (
                      <X className="h-4 w-4 flex-none text-red-500" />
                    )}
                    <code className="flex-1 truncate text-xs text-muted-foreground">
                      <span className="line-clamp-1">{item.url}</span>
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
}
