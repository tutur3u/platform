'use client';

import { History } from '@tuturuuu/icons';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../card';

export function HistoryTab() {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 @lg:text-lg text-base">
          <History className="@lg:h-5 h-4 @lg:w-5 w-4" />
          Session History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="py-8 text-center">
          <History className="mx-auto mb-3 @lg:h-12 h-8 @lg:w-12 w-8 text-muted-foreground" />
          <p className="@lg:text-base text-muted-foreground text-sm">
            Full history view coming soon
          </p>
          <p className="mt-1 @lg:text-sm text-muted-foreground text-xs">
            Advanced filtering, date ranges, and export features
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
