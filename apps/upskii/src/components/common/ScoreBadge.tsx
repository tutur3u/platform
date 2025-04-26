import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';

export default function ScoreBadge({
  variant = 'default',
  score,
  maxScore,
  className,
  children,
}: {
  variant?: any;
  score: number;
  maxScore: number;
  className?: string;
  children: React.ReactNode;
}) {
  const percentage = (score / maxScore) * 100;
  return (
    <Badge
      variant={variant}
      className={cn(
        percentage >= 80
          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
          : percentage >= 50
            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
        className
      )}
    >
      {children}
    </Badge>
  );
}
