import { ChevronDown, ChevronRight } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

interface UsageSectionProps {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  defaultCollapsed?: boolean;
  className?: string;
}

export function UsageSection({
  icon,
  title,
  description,
  children,
  className,
}: UsageSectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-base">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}

interface CollapsibleUsageSectionProps extends UsageSectionProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function CollapsibleUsageSection({
  icon,
  title,
  description,
  children,
  isCollapsed,
  onToggle,
  className,
}: CollapsibleUsageSectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-base">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
        <div className="text-muted-foreground">
          {isCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </div>
      </button>
      {!isCollapsed && (
        <div className="grid gap-3 pl-12 sm:grid-cols-2 lg:grid-cols-4">
          {children}
        </div>
      )}
    </div>
  );
}
