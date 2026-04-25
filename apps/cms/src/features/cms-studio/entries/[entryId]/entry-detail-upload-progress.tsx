'use client';

import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';

export type EntryDetailUploadProgressItem = {
  id: string;
  loaded?: number;
  name: string;
  percent: number;
  scope: 'cover' | 'media' | 'webgl';
  total?: number | null;
};

export function EntryDetailUploadProgressList({
  className,
  items,
}: {
  className?: string;
  items: EntryDetailUploadProgressItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {items.map((item) => (
        <div
          key={item.id}
          className="w-full rounded-[1rem] border border-dynamic-blue/20 bg-dynamic-blue/5 p-3"
        >
          <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium">
              {item.name}
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {Math.max(0, Math.min(100, Math.round(item.percent)))}%
            </span>
          </div>
          <Progress
            className="h-1.5 w-full"
            value={Math.max(0, Math.min(100, item.percent))}
          />
        </div>
      ))}
    </div>
  );
}
