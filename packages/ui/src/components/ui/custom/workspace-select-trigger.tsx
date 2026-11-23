'use client';

import { ChevronDown } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { type ComponentProps, useId } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { WorkspaceIcon } from './workspace-select-icon';

type TriggerWorkspace = {
  name?: string | null;
  tier?: string | null;
};

export interface WorkspaceSelectTriggerProps extends Omit<
  ComponentProps<'button'>,
  'children'
> {
  /**
   * `switch` is the sidebar entry point: the current workspace's avatar and
   * name with a chevron; the click opens the Select workspace dialog.
   * `workspace` names the current workspace (settings breadcrumb, account
   * menu).
   */
  appearance: 'switch' | 'workspace';
  /** Avatar only, for the collapsed rail. */
  compact?: boolean;
  workspace?: TriggerWorkspace | null;
  avatarUrl?: string;
  fallbackLogoUrl?: string;
  showTierBadges?: boolean;
  invitationCount?: number;
  labels: {
    select: string;
    switch: string;
    loading: string;
    invitations: string;
  };
}

/**
 * Opens the Select workspace dialog. It forwards the dialog trigger's props
 * and ref to the button, so it works as a Radix `asChild` child.
 */
export function WorkspaceSelectTrigger({
  appearance,
  compact = false,
  workspace,
  avatarUrl,
  fallbackLogoUrl,
  showTierBadges = true,
  invitationCount = 0,
  labels,
  className,
  'aria-describedby': describedBy,
  ...props
}: WorkspaceSelectTriggerProps) {
  const invitationsId = useId();
  const isSwitch = appearance === 'switch';
  const icon = (
    <WorkspaceIcon
      avatarUrl={avatarUrl}
      fallbackLogoUrl={fallbackLogoUrl}
      name={workspace?.name}
    />
  );
  // The count is announced as the button's description; the badge is its
  // visual twin.
  const invitations = invitationCount > 0 && (
    <>
      {isSwitch && compact ? (
        // The rail is too narrow for a count beside the avatar.
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 size-2 rounded-full bg-destructive"
          data-invitation-dot=""
        />
      ) : (
        <Badge
          aria-hidden="true"
          className="h-5 min-w-5 justify-center px-1 text-[10px]"
          variant="destructive"
        >
          {invitationCount > 99 ? '99+' : invitationCount}
        </Badge>
      )}
      <span className="sr-only" id={invitationsId}>
        {`${invitationCount} ${labels.invitations}`}
      </span>
    </>
  );
  // A caller's description and the invitation count both apply. The key is
  // left out when there is none, so a wrapping tooltip can still describe it.
  const description = [
    describedBy,
    invitationCount > 0 ? invitationsId : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const shared = {
    ...(description ? { 'aria-describedby': description } : {}),
    'aria-keyshortcuts': 'Meta+Shift+K Control+Shift+K',
    'data-workspace-trigger': appearance,
    type: 'button',
  } as const;

  if (!isSwitch) {
    const tier = workspace?.tier;
    return (
      <Button
        aria-label={labels.select}
        size="xs"
        variant="outline"
        {...shared}
        {...props}
        className={cn(
          compact ? 'justify-center p-0' : 'justify-start',
          'w-full whitespace-normal text-start',
          className
        )}
      >
        {icon}
        {!compact && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="line-clamp-1 min-w-0 flex-1 break-all text-xs">
              {workspace?.name || `${labels.loading}...`}
            </span>
            {showTierBadges && tier !== undefined && (
              <Badge
                className={cn(
                  'h-4 shrink-0 px-1 py-0 font-medium text-[10px]',
                  (!tier || tier === 'FREE') &&
                    'border-muted-foreground/30 bg-muted/50 text-muted-foreground',
                  tier === 'PLUS' &&
                    'border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue',
                  tier === 'PRO' &&
                    'border-dynamic-purple/50 bg-dynamic-purple/10 text-dynamic-purple',
                  tier === 'ENTERPRISE' &&
                    'border-dynamic-amber/50 bg-dynamic-amber/10 text-dynamic-amber'
                )}
                variant="outline"
              >
                {tier || 'FREE'}
              </Badge>
            )}
          </div>
        )}
        {invitations}
        {!compact && (
          <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        )}
      </Button>
    );
  }

  // A dropdown-style row: the current workspace's avatar and name with a
  // chevron; it opens the Select workspace dialog. The avatar sits in the
  // rail's icon slot in both states, so it keeps one position when the
  // sidebar expands (the border is 1px on each side, compensated in the slot).
  const name = workspace?.name || `${labels.loading}...`;
  const button = (
    <button
      aria-label={
        workspace?.name ? `${labels.switch}, ${workspace.name}` : labels.switch
      }
      {...shared}
      {...props}
      className={cn(
        'relative flex h-9 w-full cursor-pointer items-center gap-0 rounded-md border px-0 font-medium text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-50',
        compact
          ? 'border-transparent hover:bg-accent hover:text-accent-foreground'
          : 'border-border/70 bg-muted/30 text-start hover:bg-muted/60',
        className
      )}
    >
      <span
        className={cn(
          'flex shrink-0 justify-center',
          compact
            ? 'w-full'
            : 'w-[calc(var(--sidebar-rail-slot,2.9375rem)-2px)]'
        )}
      >
        {icon}
      </span>
      {!compact && (
        <>
          <span className="-ml-2 min-w-0 flex-1 truncate">{name}</span>
          {invitations && (
            <span className="flex shrink-0 items-center pl-1">
              {invitations}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className="mx-2 size-4 shrink-0 text-muted-foreground"
          />
        </>
      )}
      {compact && invitations}
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">
        <span className="block">{name}</span>
        {compact && (
          <span className="block text-muted-foreground text-xs">
            {labels.switch}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
