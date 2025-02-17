import { Surface } from '../Surface';
import { cn } from '@tutur3u/utils/format';
import { Slot } from '@radix-ui/react-slot';
import { forwardRef } from 'react';

export type PanelProps = {
  spacing?: 'medium' | 'small';
  noShadow?: boolean;
  asChild?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({ asChild, className, children, spacing, noShadow, ...rest }, ref) => {
    const panelClass = cn(
      'p-2',
      spacing === 'small' && 'p-[0.2rem]',
      className
    );

    const Comp = asChild ? Slot : 'div';

    return (
      <Comp ref={ref} {...rest}>
        <Surface className={panelClass} withShadow={!noShadow}>
          {children}
        </Surface>
      </Comp>
    );
  }
);

Panel.displayName = 'Panel';

export const PanelDivider = forwardRef<
  HTMLDivElement,
  { asChild?: boolean } & React.HTMLAttributes<HTMLDivElement>
>(({ asChild, className, children, ...rest }, ref) => {
  const dividerClass = cn('mb-2 border-b border-b-black/10 pb-2', className);

  const Comp = asChild ? Slot : 'div';

  return (
    <Comp className={dividerClass} {...rest} ref={ref}>
      {children}
    </Comp>
  );
});

PanelDivider.displayName = 'PanelDivider';

export const PanelHeader = forwardRef<
  HTMLDivElement,
  { asChild?: boolean } & React.HTMLAttributes<HTMLDivElement>
>(({ asChild, className, children, ...rest }, ref) => {
  const headerClass = cn(
    'mb-2 border-b border-b-black/10 pb-2 text-sm',
    className
  );

  const Comp = asChild ? Slot : 'div';

  return (
    <Comp className={headerClass} {...rest} ref={ref}>
      {children}
    </Comp>
  );
});

PanelHeader.displayName = 'PanelHeader';

export const PanelSection = forwardRef<
  HTMLDivElement,
  { asChild?: boolean } & React.HTMLAttributes<HTMLDivElement>
>(({ asChild, className, children, ...rest }, ref) => {
  const sectionClass = cn('mt-4 first:mt-1', className);

  const Comp = asChild ? Slot : 'div';

  return (
    <Comp className={sectionClass} {...rest} ref={ref}>
      {children}
    </Comp>
  );
});

PanelSection.displayName = 'PanelSection';

export const PanelHeadline = forwardRef<
  HTMLDivElement,
  { asChild?: boolean } & React.HTMLAttributes<HTMLDivElement>
>(({ asChild, className, children, ...rest }, ref) => {
  const headlineClass = cn(
    'mb-2 ml-1.5 text-xs font-medium text-black/80 dark:text-white/80',
    className
  );

  const Comp = asChild ? Slot : 'div';

  return (
    <Comp className={headlineClass} {...rest} ref={ref}>
      {children}
    </Comp>
  );
});

PanelHeadline.displayName = 'PanelHeadline';

export const PanelFooter = forwardRef<
  HTMLDivElement,
  { asChild?: boolean } & React.HTMLAttributes<HTMLDivElement>
>(({ asChild, className, children, ...rest }, ref) => {
  const footerClass = cn(
    'mt-2 border-t border-black/10 pt-2 text-sm',
    className
  );

  const Comp = asChild ? Slot : 'div';

  return (
    <Comp className={footerClass} {...rest} ref={ref}>
      {children}
    </Comp>
  );
});

PanelFooter.displayName = 'PanelFooter';
