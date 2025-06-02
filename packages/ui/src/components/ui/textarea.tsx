import { cn } from '@tuturuuu/utils/format';
import * as React from 'react';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content border-input shadow-xs placeholder:text-muted-foreground aria-invalid:border-destructive/60 dark:aria-invalid:border-destructive flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base transition-[color,box-shadow] focus-visible:ring-transparent disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
