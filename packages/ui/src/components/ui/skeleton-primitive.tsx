import { cn } from '@tuturuuu/utils/format';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Base placeholder surface. A soft light sweep (the shared `shimmer` keyframe
 * in globals.css) runs over a token-coloured block. The sweep is a composited
 * transform on a pseudo-element, so it never triggers layout. Under
 * `prefers-reduced-motion` the block stays static. The sweep sits behind any
 * children (`isolate` + `before:-z-10`).
 */
export const skeletonClassName =
  'relative isolate overflow-hidden rounded-md bg-primary/10 before:pointer-events-none before:absolute before:-z-10 before:inset-0 before:animate-[shimmer_2.4s_ease-in-out_infinite] before:bg-linear-to-r before:from-transparent before:via-foreground/[0.06] before:to-transparent motion-reduce:before:hidden';

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(skeletonClassName, className)}
      {...props}
    />
  );
}

/** Line-box heights that match Tailwind's text sizes, so swapping is CLS-free. */
const LINE_BOX = {
  xs: 'h-4',
  sm: 'h-5',
  base: 'h-6',
  lg: 'h-7',
  xl: 'h-7',
} as const;

const LINE_BAR = {
  xs: 'h-3',
  sm: 'h-3.5',
  base: 'h-4',
  lg: 'h-5',
  xl: 'h-5',
} as const;

export type SkeletonTextSize = keyof typeof LINE_BOX;

export interface SkeletonLineProps extends ComponentProps<'div'> {
  /** Text size the real line will use; the box takes its line height. */
  size?: SkeletonTextSize;
  /** Width class for the bar, e.g. `w-32` or `w-2/3`. Defaults to full width. */
  barClassName?: string;
}

/** One line of text. The outer box takes the line height; the bar sits inside. */
export function SkeletonLine({
  size = 'sm',
  className,
  barClassName,
  ...props
}: SkeletonLineProps) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton-line"
      className={cn('flex items-center', LINE_BOX[size], className)}
      {...props}
    >
      <Skeleton className={cn(LINE_BAR[size], 'w-full', barClassName)} />
    </div>
  );
}

const PARAGRAPH_WIDTHS = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3'];

/** Several text lines; the last one is shorter, like real prose. */
export function SkeletonText({
  lines = 3,
  size = 'sm',
  className,
}: {
  lines?: number;
  size?: SkeletonTextSize;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton-text"
      className={cn('flex flex-col', className)}
    >
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonLine
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={index}
          size={size}
          barClassName={
            index === lines - 1 && lines > 1
              ? 'w-3/5'
              : PARAGRAPH_WIDTHS[index % PARAGRAPH_WIDTHS.length]
          }
        />
      ))}
    </div>
  );
}

const AVATAR_SIZE = {
  xs: 'size-5',
  sm: 'size-6',
  md: 'size-8',
  lg: 'size-10',
  xl: 'size-12',
} as const;

export function SkeletonAvatar({
  size = 'md',
  shape = 'circle',
  className,
}: {
  size?: keyof typeof AVATAR_SIZE;
  shape?: 'circle' | 'square';
  className?: string;
}) {
  return (
    <Skeleton
      aria-hidden="true"
      data-slot="skeleton-avatar"
      className={cn(
        'shrink-0',
        AVATAR_SIZE[size],
        shape === 'circle' ? 'rounded-full' : 'rounded-md',
        className
      )}
    />
  );
}

export interface LoadingRegionProps extends Omit<
  ComponentProps<'div'>,
  'children'
> {
  /** Screen-reader text, already translated through the app's message bundle. */
  srLabel: string;
  children: ReactNode;
}

/**
 * Wraps skeleton placeholders. Assistive tech hears one polite "loading"
 * announcement; sighted users see only the placeholders (kit pieces are
 * `aria-hidden`). The label renders first so `space-y-*` / `gap-*` on the
 * region keep spacing only between the visible placeholders. The region itself
 * is not `aria-busy` (a busy live region suppresses its own announcement); set
 * `aria-busy` on the container whose content is loading, if needed.
 */
export function LoadingRegion({
  srLabel,
  className,
  children,
  ...props
}: LoadingRegionProps) {
  return (
    <div
      role="status"
      data-slot="loading-region"
      className={className}
      {...props}
    >
      <span className="sr-only">{srLabel}</span>
      {children}
    </div>
  );
}

/**
 * Short fade for content that replaces a skeleton. CSS only (no state, no
 * delay); skipped under `prefers-reduced-motion`.
 */
export function FadeIn({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="fade-in"
      className={cn(
        'fade-in-0 animate-in duration-200 ease-out motion-reduce:animate-none',
        className
      )}
      {...props}
    />
  );
}
