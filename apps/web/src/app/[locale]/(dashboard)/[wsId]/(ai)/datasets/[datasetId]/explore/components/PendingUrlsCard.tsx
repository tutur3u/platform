import type { UrlWithProgress } from '../types';
import { Badge } from '@tutur3u/ui/components/ui/badge';
import { Card, CardContent } from '@tutur3u/ui/components/ui/card';
import { Clock } from 'lucide-react';

interface Props {
  pendingUrls: UrlWithProgress[];
}

export function PendingUrlsCard({ pendingUrls }: Props) {
  return (
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
}
