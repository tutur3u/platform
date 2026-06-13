import { cn } from '@tuturuuu/utils/format';

type OperatorDialogSize = 'compact' | 'medium' | 'large' | 'xlarge';

const dialogSizeClasses: Record<OperatorDialogSize, string> = {
  compact: 'w-[min(calc(100vw-2rem),32rem)]',
  large: 'w-[min(calc(100vw-2rem),64rem)]',
  medium: 'w-[min(calc(100vw-2rem),48rem)]',
  xlarge: 'w-[min(calc(100vw-2rem),72rem)]',
};

export function operatorDialogContentClassName(
  size: OperatorDialogSize,
  className?: string
) {
  return cn(
    'max-h-[calc(100dvh-2rem)] max-w-none overflow-y-auto',
    dialogSizeClasses[size],
    className
  );
}
