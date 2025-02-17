import { cn } from '@tutur3u/utils/format';
import React from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'quaternary'
  | 'ghost';
export type ButtonSize = 'medium' | 'small' | 'icon' | 'iconSmall';

export type ButtonProps = {
  variant?: ButtonVariant;
  active?: boolean;
  activeClassname?: string;
  buttonSize?: ButtonSize;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      active,
      buttonSize = 'medium',
      children,
      disabled,
      variant = 'primary',
      className,
      activeClassname,
      ...rest
    },
    ref
  ) => {
    const buttonClassName = cn(
      'group flex items-center justify-center gap-2 rounded-md border border-transparent text-sm font-semibold whitespace-nowrap disabled:opacity-50',

      variant === 'primary' &&
        cn(
          'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black',
          !disabled &&
            !active &&
            'hover:bg-neutral-800 active:bg-neutral-900 dark:hover:bg-neutral-200 dark:active:bg-neutral-300',
          active && cn('bg-neutral-900 dark:bg-neutral-300', activeClassname)
        ),

      variant === 'secondary' &&
        cn(
          'text-neutral-900 dark:text-white',
          !disabled &&
            !active &&
            'hover:bg-neutral-100 active:bg-neutral-200 dark:hover:bg-neutral-900 dark:active:bg-neutral-800',
          active && 'bg-neutral-200 dark:bg-neutral-800'
        ),

      variant === 'tertiary' &&
        cn(
          'bg-neutral-50 text-neutral-900 dark:border-neutral-900 dark:bg-neutral-900 dark:text-white',
          !disabled &&
            !active &&
            'hover:bg-neutral-100 active:bg-neutral-200 dark:hover:bg-neutral-800 dark:active:bg-neutral-700',
          active && cn('bg-neutral-200 dark:bg-neutral-800', activeClassname)
        ),

      variant === 'ghost' &&
        cn(
          'border-transparent bg-transparent text-neutral-500 dark:text-neutral-400',
          !disabled &&
            !active &&
            'hover:bg-black/5 hover:text-neutral-700 active:bg-black/10 active:text-neutral-800 dark:hover:bg-white/10 dark:hover:text-neutral-300 dark:active:text-neutral-200',
          active &&
            cn(
              'bg-black/10 text-neutral-800 dark:bg-white/20 dark:text-neutral-200',
              activeClassname
            )
        ),

      buttonSize === 'medium' && 'px-3 py-2',
      buttonSize === 'small' && 'px-2 py-1',
      buttonSize === 'icon' && 'h-8 w-8',
      buttonSize === 'iconSmall' && 'h-6 w-6',

      className
    );

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={buttonClassName}
        {...rest}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
