'use client';

import {
  Building2 as BuildingIcon,
  ChevronDown,
  EyeDashed as EyeDashedIcon,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentProps, ComponentType, ReactNode } from 'react';

export type ShellLinkComponent = ComponentType<
  ComponentProps<'a'> & { href: string }
>;
export const ShellAnchor: ShellLinkComponent = (props) => <a {...props} />;

interface WorkspaceSelectVisibilityToggleProps {
  hideLabel: string;
  onToggle: () => void;
  showLabel: string;
  visible: boolean;
}

export function WorkspaceSelectVisibilityToggle({
  hideLabel,
  onToggle,
  showLabel,
  visible,
}: WorkspaceSelectVisibilityToggleProps) {
  const label = visible ? hideLabel : showLabel;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-controls="sidebar-workspace-selector"
          aria-expanded={visible}
          aria-label={label}
          className="size-8 shrink-0 text-muted-foreground shadow-none hover:text-foreground"
          data-slot="workspace-select-visibility-toggle"
          onClick={onToggle}
          size="icon"
          type="button"
          variant="ghost"
        >
          {visible ? (
            <EyeDashedIcon aria-hidden className="size-4" />
          ) : (
            <BuildingIcon aria-hidden className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export interface SatelliteBrandProps {
  LinkComponent?: ShellLinkComponent;
  logo: ReactNode;
  appName: string;
  actions?: ReactNode;
  appHref: string;
  centralHref: string;
  className?: string;
  launcherLabel?: string;
  onAppClick?: () => void;
}

export function SatelliteBrand({
  LinkComponent: Link = ShellAnchor,
  logo,
  appName,
  actions,
  appHref,
  centralHref,
  className,
  launcherLabel = 'Open apps',
  onAppClick,
}: SatelliteBrandProps) {
  const appControl = onAppClick ? (
    <button
      aria-haspopup="dialog"
      aria-label={launcherLabel}
      className="group flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 font-semibold text-lg tracking-tight transition hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onAppClick}
      type="button"
    >
      <span className="truncate">{appName}</span>
      <ChevronDown
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground"
      />
    </button>
  ) : (
    <Link
      className="min-w-0 truncate rounded-md font-semibold text-lg tracking-tight transition hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={appHref}
    >
      {appName}
    </Link>
  );

  return (
    <div className={cn('flex min-w-0 flex-1 items-center gap-2.5', className)}>
      <Link
        aria-label="Tuturuuu"
        className="flex size-9 shrink-0 items-center justify-center rounded-xl transition hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={centralHref}
      >
        {logo}
      </Link>
      <span
        aria-hidden
        className="h-5 w-px shrink-0 self-center rounded-full bg-foreground/10"
      />
      {appControl}
      {actions ? <div className="ml-auto flex-none">{actions}</div> : null}
    </div>
  );
}
