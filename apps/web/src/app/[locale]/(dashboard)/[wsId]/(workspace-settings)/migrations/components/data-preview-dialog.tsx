'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useState } from 'react';

interface DataPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data: unknown[] | null;
  totalCount: number;
}

export function DataPreviewDialog({
  open,
  onOpenChange,
  title,
  data,
  totalCount,
}: DataPreviewDialogProps) {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const toggleExpand = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const previewData = data?.slice(0, 50) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Data Preview: {title}</DialogTitle>
          <DialogDescription>
            Showing {previewData.length} of {totalCount} records
            {previewData.length < totalCount && ' (limited to first 50)'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[60vh]">
          <div className="space-y-2 pr-4">
            {previewData.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No data available
              </div>
            ) : (
              previewData.map((item, index) => (
                <div
                  key={index}
                  className="rounded-lg border bg-muted/30 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(index)}
                    className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50"
                  >
                    <span className="font-mono text-muted-foreground">
                      Record #{index + 1}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {expandedItems.has(index) ? 'Collapse' : 'Expand'}
                    </span>
                  </button>
                  {expandedItems.has(index) && (
                    <div className="border-t p-3">
                      <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs">
                        {JSON.stringify(item, null, 2)}
                      </pre>
                    </div>
                  )}
                  {!expandedItems.has(index) && (
                    <div className="border-t px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(item as Record<string, unknown>)
                          .slice(0, 4)
                          .map(([key, value]) => (
                            <span
                              key={key}
                              className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono text-xs"
                            >
                              <span className="text-muted-foreground">
                                {key}:
                              </span>
                              <span className="max-w-37.5 truncate">
                                {typeof value === 'object'
                                  ? JSON.stringify(value)
                                  : String(value ?? 'null')}
                              </span>
                            </span>
                          ))}
                        {Object.keys(item as Record<string, unknown>).length >
                          4 && (
                          <span className="text-muted-foreground text-xs">
                            +
                            {Object.keys(item as Record<string, unknown>)
                              .length - 4}{' '}
                            more fields
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
