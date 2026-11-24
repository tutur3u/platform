import { cn } from '@tuturuuu/utils/format';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

const alertVariants = cva(
  'relative w-full rounded-[var(--alert-radius,var(--radius))] border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default:
          'border-[color:var(--alert-border,var(--border))] bg-[var(--alert-bg,var(--background))] text-foreground',
        destructive:
          'border-[color:var(--alert-border,var(--alert-destructive-edge))] bg-[var(--alert-bg,transparent)] text-destructive [&>svg]:text-destructive',
        success:
          'border-[color:var(--alert-border,color-mix(in_oklab,var(--success)_35%,transparent))] bg-[var(--alert-bg,color-mix(in_oklab,var(--success)_8%,transparent))] text-foreground [&>svg]:text-success',
        warning:
          'border-[color:var(--alert-border,color-mix(in_oklab,var(--warning)_35%,transparent))] bg-[var(--alert-bg,color-mix(in_oklab,var(--warning)_8%,transparent))] text-foreground [&>svg]:text-warning',
        info: 'border-[color:var(--alert-border,color-mix(in_oklab,var(--info)_35%,transparent))] bg-[var(--alert-bg,color-mix(in_oklab,var(--info)_8%,transparent))] text-foreground [&>svg]:text-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    data-slot="alert"
    data-variant={variant ?? 'default'}
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertDescription, AlertTitle };
