'use client';

import { History } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';

export function HistoryTab() {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base @lg:text-lg">
          <History className="h-4 w-4 @lg:h-5 @lg:w-5" />
          Session History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="py-8 text-center">
          <History className="mx-auto mb-3 h-8 w-8 text-muted-foreground @lg:h-12 @lg:w-12" />
          <p className="text-muted-foreground text-sm @lg:text-base">
            Full history view coming soon
          </p>
          <p className="mt-1 text-muted-foreground text-xs @lg:text-sm">
            Advanced filtering, date ranges, and export features
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
