import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';

/**
 * Floating toolbar or dock surface with concentric corners. Padding, gap,
 * control height and both radii come from the tokens in floating-bar.css;
 * every Button inside takes the inner radius and control height, so an
 * active (filled) control sits flush with the inset.
 */
function FloatingBar({
  className,
  role = 'toolbar',
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="floating-bar"
      role={role}
      className={cn(
        // A ring, not a border: a border would add to the inset and break
        // the inner = outer − padding relation.
        'flex max-w-full items-center gap-(--bar-gap) rounded-(--radius-bar) bg-background/95 p-(--bar-padding) shadow-foreground/10 shadow-lg ring-1 ring-foreground/5 backdrop-blur',
        '**:data-[slot=button]:h-(--bar-control-height) **:data-[slot=button]:rounded-(--radius-bar-inner)',
        '**:data-[slot=button]:data-[size=icon]:w-(--bar-control-height)',
        '**:data-[slot=floating-bar-group]:gap-(--bar-gap)',
        className
      )}
      {...props}
    />
  );
}

/** Groups related controls (for example a view toggle) without new padding. */
function FloatingBarGroup({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="floating-bar-group"
      role="group"
      className={cn('flex shrink-0 items-center', className)}
      {...props}
    />
  );
}

/**
 * A fixed-length divider, centred on the controls, with --bar-padding of
 * space on both sides once the bar gap is added.
 */
function FloatingBarSeparator({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="floating-bar-separator"
      aria-hidden
      className={cn(
        'mx-(--bar-separator-margin) h-(--bar-separator-height) w-px shrink-0 self-center bg-border',
        className
      )}
      {...props}
    />
  );
}

export { FloatingBar, FloatingBarGroup, FloatingBarSeparator };
