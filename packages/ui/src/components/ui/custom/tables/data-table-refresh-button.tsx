'use client';

import { cn } from '@tuturuuu/utils/format';
import { RefreshCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../button';

export function DataTableRefreshButton({
  onRefresh,
  refreshText,
  disabled,
}: {
  onRefresh: () => void;
  refreshText: string;
  disabled?: boolean;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!isRefreshing) return;
    const timeout = setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
  }, [isRefreshing]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="ml-auto h-8 w-full md:w-fit"
      onClick={() => {
        setIsRefreshing(true);
        onRefresh();
      }}
      disabled={isRefreshing || disabled}
    >
      <RefreshCcw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
      {refreshText}
    </Button>
  );
}
