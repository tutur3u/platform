'use client';

import { cn } from '@tuturuuu/utils/format';
import * as React from 'react';

interface FormRequiredIndicatorProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  show?: boolean;
}

const FormRequiredIndicator = React.forwardRef<
  HTMLSpanElement,
  FormRequiredIndicatorProps
>(({ className, show = true, ...props }, ref) => {
  if (!show) return null;

  return (
    <span
      ref={ref}
      className={cn('text-destructive ml-1', className)}
      aria-hidden="true"
      {...props}
    >
      *
    </span>
  );
});

FormRequiredIndicator.displayName = 'FormRequiredIndicator';

export { FormRequiredIndicator };
