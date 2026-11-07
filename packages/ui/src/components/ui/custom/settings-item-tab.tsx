import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

// Declared here so every app emits these classes, including apps that do not
// scan the package rendering the row.
const CONTROL_WIDTHS = {
  xs: '@lg:w-48',
  sm: '@lg:w-56',
  md: '@lg:w-64',
  lg: '@lg:w-72',
  xl: '@lg:w-80',
  '2xl': '@lg:w-96',
} as const;

interface SettingItemTabProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  /**
   * `inline` keeps the label and a compact control on one line, and falls back
   * to stacked when the row is too narrow. `stacked` gives the control the full
   * row width, for tile pickers, textareas and lists.
   */
  layout?: 'inline' | 'stacked';
  /** Width of the control in a wide inline row, such as a text field. */
  controlWidth?: keyof typeof CONTROL_WIDTHS;
  className?: string;
  controlClassName?: string;
}

/**
 * One setting. Renders as its own card, or as a divided row inside
 * `SettingsSection`.
 */
export function SettingItemTab({
  title,
  description,
  children,
  icon,
  layout = 'inline',
  controlWidth,
  className,
  controlClassName,
}: SettingItemTabProps) {
  const inline = layout === 'inline';

  return (
    <div
      className={cn(
        '@container not-in-data-[slot=settings-card]:rounded-xl not-in-data-[slot=settings-card]:border not-in-data-[slot=settings-card]:bg-card px-4 py-4 md:px-5',
        className
      )}
      data-slot="settings-row"
    >
      <div
        className={cn(
          'flex flex-col gap-3',
          inline &&
            '@lg:flex-row @lg:items-center @lg:justify-between @lg:gap-8'
        )}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 font-medium text-foreground text-sm">
            {icon && (
              <span className="shrink-0 text-muted-foreground">{icon}</span>
            )}
            {title}
          </div>
          {description && (
            <div className="whitespace-pre-line text-muted-foreground text-sm">
              {description}
            </div>
          )}
        </div>
        {children && (
          <div
            className={cn(
              'min-w-0',
              inline && '@lg:shrink-0',
              controlWidth && CONTROL_WIDTHS[controlWidth],
              controlClassName
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
