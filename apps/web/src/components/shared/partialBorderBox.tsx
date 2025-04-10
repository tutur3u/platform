import { cn } from '@tuturuuu/utils/format';
import React from 'react';

interface PartialBorderBoxProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  borderTop?: boolean;
  borderRight?: boolean;
  borderBottom?: boolean;
  borderLeft?: boolean;
}

export const PartialBorderBox = ({
  children,
  className,
  borderTop = true,
  borderRight = true,
  borderBottom = true,
  borderLeft = true,
  ...props
}: PartialBorderBoxProps) => {
  return (
    <div
      className={cn(
        'relative rounded-lg bg-background p-4',
        {
          'border-t': borderTop,
          'border-r': borderRight,
          'border-b': borderBottom,
          'border-l': borderLeft,
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
