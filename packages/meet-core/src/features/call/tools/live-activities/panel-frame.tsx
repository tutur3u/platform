'use client';

import { X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import type { ReactNode } from 'react';
import { ResizableCallPanel } from '../../components/resizable-call-panel';

export function LiveActivityPanelFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <ResizableCallPanel label={title}>
      <header className="flex items-center justify-between gap-2 border-border border-b px-3 py-2">
        <h2 className="font-semibold text-foreground text-sm">{title}</h2>
        {onClose ? (
          <Button
            aria-label="Close panel"
            onClick={onClose}
            size="icon"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </header>
      <div className="min-h-0 space-y-3 overflow-y-auto p-3">{children}</div>
    </ResizableCallPanel>
  );
}