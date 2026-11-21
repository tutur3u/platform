'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { XIcon } from '@tuturuuu/icons/lucide-static';
import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';

import { useSidebarOverlayOpenChange } from './custom/sidebar-overlay-context';

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  const onOpenChange = useSidebarOverlayOpenChange(props);
  return (
    <SheetPrimitive.Root
      data-slot="sheet"
      {...props}
      onOpenChange={onOpenChange}
    />
  );
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/80 data-[state=closed]:animate-out data-[state=open]:animate-in',
        className
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    />
  );
}

/**
 * Transparent borders hold the notch and home-indicator insets, so a caller's
 * own padding (often `p-0`) cannot remove them, and the absolutely placed
 * close button clears the notch with the content. Bottom sheets take the home
 * indicator as padding, matching the Sorbet bottom-sheet rule.
 */
const TOP_INSET = {
  '--sheet-inset-top': 'env(safe-area-inset-top, 0px)',
  borderTop: 'var(--sheet-inset-top) solid transparent',
};
const SAFE_AREA_BORDERS = {
  top: TOP_INSET,
  edge: {
    ...TOP_INSET,
    '--sheet-inset-bottom': 'env(safe-area-inset-bottom, 0px)',
    borderBottom: 'var(--sheet-inset-bottom) solid transparent',
  },
} as const satisfies Record<string, React.CSSProperties>;

function SheetContent({
  className,
  children,
  side = 'right',
  style,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-50 flex flex-col gap-4 overflow-hidden bg-background shadow-lg transition-transform ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:translate-x-full data-[state=open]:translate-x-0 sm:max-w-sm',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0 sm:max-w-sm',
          side === 'top' &&
            'inset-x-0 top-0 h-auto border-b data-[state=closed]:-translate-y-full data-[state=open]:translate-y-0',
          side === 'bottom' &&
            'inset-x-0 bottom-0 h-auto border-t pb-[env(safe-area-inset-bottom,0px)] data-[state=closed]:translate-y-full data-[state=open]:translate-y-0',
          className
        )}
        style={{
          ...(side === 'bottom'
            ? undefined
            : SAFE_AREA_BORDERS[side === 'top' ? 'top' : 'edge']),
          ...style,
        }}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className={cn(
            'absolute top-4 right-4 rounded-xs opacity-70 pointer-coarse:after:absolute pointer-coarse:after:-inset-3.5 pointer-coarse:after:content-[""] ring-offset-background transition-opacity hover:opacity-100 focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary'
          )}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 p-4', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-semibold text-foreground tracking-tight', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
