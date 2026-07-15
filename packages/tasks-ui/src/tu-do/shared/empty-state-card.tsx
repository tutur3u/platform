import type { LucideIcon } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

interface EmptyStateCardProps {
  title: string;
  description: string;
  actionLabel: string;
  ActionIcon: LucideIcon;
  onAction: () => void;
}

/**
 * EmptyStateCard component displays a centered empty state with an action button.
 * Used consistently across popovers when no items are configured (labels, projects, etc.).
 *
 * @example
 * ```tsx
 * <EmptyStateCard
 *   title="No labels configured yet"
 *   description="Create labels to organize your tasks"
 *   actionLabel="Create Label"
 *   ActionIcon={Plus}
 *   onAction={() => setShowNewLabelDialog(true)}
 * />
 * ```
 */
export function EmptyStateCard({
  title,
  description,
  actionLabel,
  ActionIcon,
  onAction,
}: EmptyStateCardProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-4">
      <div className="space-y-2 text-center">
        <p className="font-medium text-muted-foreground text-sm">{title}</p>
        <p className="text-muted-foreground/60 text-xs">{description}</p>
      </div>
      <Button size="sm" onClick={onAction} className="mt-2 w-full">
        <ActionIcon className="mr-1.5 h-3.5 w-3.5" />
        {actionLabel}
      </Button>
    </div>
  );
}
