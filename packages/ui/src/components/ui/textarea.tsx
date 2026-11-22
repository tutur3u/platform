import { cn } from '@tuturuuu/utils/format';
import type * as React from 'react';
import { fieldFocusClassName } from './field-focus';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow,border-color] placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/60 dark:aria-invalid:border-destructive',
        fieldFocusClassName,
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
