'use client';

import { GripVerticalIcon } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';
import {
  Group,
  type GroupProps as GroupPropsOriginal,
  Panel,
  Separator,
} from 'react-resizable-panels';

interface ResizablePanelGroupProps
  extends Omit<GroupPropsOriginal, 'orientation' | 'onLayoutChange'> {
  direction?: 'horizontal' | 'vertical';
  onLayout?: (sizes: number[]) => void;
}

export function normalizeLegacyPanelSize(size: number | string | undefined) {
  // react-resizable-panels v3 and the shadcn wrapper treated numeric values as
  // percentages. v4 treats them as pixels, so preserve the shared wrapper's
  // established contract while still allowing explicit CSS units.
  return typeof size === 'number' ? `${size}%` : size;
}

function ResizablePanelGroup({
  className,
  direction,
  onLayout,
  ...props
}: ResizablePanelGroupProps) {
  return (
    <Group
      data-slot="resizable-panel-group"
      orientation={direction}
      onLayoutChanged={
        onLayout
          ? (layout) => {
              // Layout values are flex percentages (0-100). Preserve the
              // wrapper's array callback for existing consumers.
              const sizes = Object.values(layout);
              onLayout(sizes);
            }
          : undefined
      }
      className={cn(
        'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
        className
      )}
      {...props}
    />
  );
}

function ResizablePanel({
  collapsedSize,
  defaultSize,
  maxSize,
  minSize,
  ...props
}: React.ComponentProps<typeof Panel>) {
  return (
    <Panel
      collapsedSize={normalizeLegacyPanelSize(collapsedSize)}
      data-slot="resizable-panel"
      defaultSize={normalizeLegacyPanelSize(defaultSize)}
      maxSize={normalizeLegacyPanelSize(maxSize)}
      minSize={normalizeLegacyPanelSize(minSize)}
      {...props}
    />
  );
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        'relative flex w-px cursor-col-resize items-center justify-center bg-border transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 hover:bg-primary/60 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:cursor-row-resize data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-3 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90',
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-xs border bg-border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </Separator>
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
