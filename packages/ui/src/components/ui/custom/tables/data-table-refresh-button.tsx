'use client';

import { Button } from '@repo/ui/components/ui/button';
import { RefreshCcw } from 'lucide-react';

export function DataTableRefreshButton({
  router,
  refreshText,
}: {
  router: any;
  refreshText: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="ml-auto h-8 w-full md:w-fit"
      onClick={() => router.refresh()}
    >
      <RefreshCcw className="mr-2 h-4 w-4" />
      {refreshText}
    </Button>
  );
}
