import { cn } from '@tuturuuu/utils/format';
import * as React from 'react';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:ring-transparent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/60 dark:aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
