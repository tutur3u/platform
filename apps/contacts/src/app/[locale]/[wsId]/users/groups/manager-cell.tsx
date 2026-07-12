'use client';

import { Link2, Link2Off, Users } from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ManagerLinkDialog } from './manager-link-dialog';

type Manager = NonNullable<UserGroup['managers']>[number];

interface ManagerCellLabels {
  linkedAll: string;
  linkedCount: string;
  linkedNone: string;
  linkedSome: string;
  managers: string;
}

interface ManagerCellProps {
  canLink?: boolean;
  labels: ManagerCellLabels;
  managers?: UserGroup['managers'];
  wsId: string;
}

function getManagerName(manager: Manager) {
  return manager.full_name || manager.display_name || manager.email || '-';
}

function getManagerFallback(manager: Manager) {
  return manager.full_name?.[0] || manager.display_name?.[0] || '?';
}

function getLinkedSummary(managers: Manager[], labels: ManagerCellLabels) {
  const linkedCount = managers.filter(
    (manager) => manager.hasLinkedPlatformUser
  ).length;

  if (linkedCount === managers.length) {
    return {
      Icon: Link2,
      className: 'text-dynamic-green',
      label: labels.linkedAll,
      linkedCount,
    };
  }

  if (linkedCount === 0) {
    return {
      Icon: Link2Off,
      className: 'text-dynamic-red',
      label: labels.linkedNone,
      linkedCount,
    };
  }

  return {
    Icon: Link2,
    className: 'text-dynamic-amber',
    label: labels.linkedSome,
    linkedCount,
  };
}

function ManagerIdentity({
  canLink,
  manager,
  wsId,
}: {
  canLink?: boolean;
  manager: Manager;
  wsId: string;
}) {
  const isLinked = manager.hasLinkedPlatformUser;

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={manager.avatar_url || undefined} />
          <AvatarFallback>{getManagerFallback(manager)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-sm">
              {getManagerName(manager)}
            </span>
            {isLinked ? (
              <Link2 className="h-3.5 w-3.5 shrink-0 text-dynamic-green" />
            ) : (
              <Link2Off className="h-3.5 w-3.5 shrink-0 text-dynamic-red" />
            )}
          </div>
          {manager.email && (
            <span className="truncate text-muted-foreground text-xs">
              {manager.email}
            </span>
          )}
        </div>
      </div>
      {!isLinked && canLink ? (
        <ManagerLinkDialog manager={manager} wsId={wsId} />
      ) : null}
    </div>
  );
}

export function ManagerCell({
  canLink,
  labels,
  managers,
  wsId,
}: ManagerCellProps) {
  if (!managers?.length) return <div>-</div>;

  if (managers.length === 1) {
    const manager = managers[0];
    if (!manager) return <div>-</div>;
    return <ManagerIdentity canLink={canLink} manager={manager} wsId={wsId} />;
  }

  const summary = getLinkedSummary(managers, labels);
  const SummaryIcon = summary.Icon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-full gap-2 border border-border/60 bg-muted/40 px-2 hover:bg-muted"
          aria-label={`${summary.label}: ${labels.linkedCount}`}
        >
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {managers.length}
            <span className="ml-1 hidden sm:inline">{labels.managers}</span>
          </span>
          <SummaryIcon
            className={`h-3.5 w-3.5 shrink-0 ${summary.className}`}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-medium leading-none">{labels.managers}</h4>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border border-current/20 bg-muted/50 px-2 py-1 font-medium text-xs ${summary.className}`}
            >
              <SummaryIcon className="h-3.5 w-3.5" />
              {labels.linkedCount}
            </span>
          </div>
          <div className="grid gap-2">
            {managers.map((manager) => (
              <ManagerIdentity
                key={manager.id}
                canLink={canLink}
                manager={manager}
                wsId={wsId}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
