import { cn } from '@tuturuuu/utils/format';

type OperatorDialogSize =
  | 'compact'
  | 'fullscreen'
  | 'large'
  | 'medium'
  | 'workflow'
  | 'xlarge';

const dialogSizeClasses: Record<OperatorDialogSize, string> = {
  compact: 'w-[min(calc(100vw-2rem),32rem)]',
  fullscreen: 'w-[min(calc(100vw-1rem),112rem)]',
  large: 'w-[min(calc(100vw-2rem),64rem)]',
  medium: 'w-[min(calc(100vw-2rem),48rem)]',
  workflow: 'w-[min(calc(100vw-2rem),96rem)]',
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
