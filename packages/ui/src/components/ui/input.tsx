import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';
import { fieldFocusClassName } from './field-focus';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow,border-color] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/60 md:text-sm dark:aria-invalid:border-destructive',
        fieldFocusClassName,
        className
      )}
      {...props}
    />
  );
}

export { Input };
