'use client';

import {
  ArrowRight,
  Building2,
  Check,
  ExternalLink,
  Globe2,
  PanelTop,
  Search,
  User,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { CommandItem } from '@tuturuuu/ui/command';
import type { LaunchableApp } from '@tuturuuu/utils/launchable-apps';
import type { ReactNode } from 'react';
import type {
  CommandLauncherNavItem,
  GlobalCommandLauncherLabels,
  LauncherWorkspace,
} from './command-launcher-types';
import { commandItemValue } from './command-launcher-utils';
import { HighlightMatch } from './highlight-match';

const ROW_CLASS_NAME =
  'group/row min-h-11 gap-2.5 rounded-lg px-2.5 py-1.5 data-[selected=true]:bg-accent';

export function AppCommandItem({
  app,
  isCurrent,
  labels,
  matchContext,
  onSelect,
  query = '',
  value,
}: {
  app: LaunchableApp;
  isCurrent: boolean;
  labels: GlobalCommandLauncherLabels;
  matchContext: string | null;
  onSelect: () => void;
  query?: string;
  value?: string;
}) {
  return (
    <CommandItem
      className={ROW_CLASS_NAME}
      onSelect={onSelect}
      value={value ?? commandItemValue.app(app)}
    >
      <ItemIcon icon={<Globe2 className="size-4" />} />
      <ItemText
        badge={isCurrent ? labels.current : undefined}
        query={query}
        subtitle={matchContext ?? app.productionUrl}
        title={app.title}
      />
      <ItemAction label={labels.openApp} />
    </CommandItem>
  );
}

export function WorkspaceCommandItem({
  isCurrent,
  labels,
  matchContext,
  onSelect,
  query = '',
  value,
  workspace,
}: {
  isCurrent: boolean;
  labels: GlobalCommandLauncherLabels;
  matchContext: string | null;
  onSelect: () => void;
  query?: string;
  value?: string;
  workspace: LauncherWorkspace;
}) {
  const accessType = 'access_type' in workspace ? workspace.access_type : null;
  return (
    <CommandItem
      className={ROW_CLASS_NAME}
      onSelect={onSelect}
      value={value ?? commandItemValue.workspace(workspace)}
    >
      <ItemIcon
        icon={
          workspace.personal ? (
            <User className="size-4" />
          ) : (
            <Building2 className="size-4" />
          )
        }
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">
            <HighlightMatch
              query={query}
              text={workspace.name || workspace.id}
            />
          </span>
          {isCurrent ? <StatusBadge label={labels.current} /> : null}
          {workspace.personal ? <StatusBadge label={labels.personal} /> : null}
          {accessType === 'guest' ? <StatusBadge label={labels.guest} /> : null}
        </div>
        <p className="truncate text-muted-foreground text-xs">
          {matchContext ?? workspace.id}
        </p>
      </div>
      <span className="hidden text-muted-foreground text-xs sm:inline">
        {labels.openWorkspace}
      </span>
      {isCurrent ? (
        <Check className="size-4" />
      ) : (
        <ArrowRight className="size-4" />
      )}
    </CommandItem>
  );
}

export function NavigationCommandItem({
  item,
  labels,
  matchContext,
  onSelect,
  query = '',
  value,
}: {
  item: CommandLauncherNavItem;
  labels: GlobalCommandLauncherLabels;
  matchContext: string | null;
  onSelect: () => void;
  query?: string;
  value?: string;
}) {
  return (
    <CommandItem
      className={ROW_CLASS_NAME}
      onSelect={onSelect}
      value={value ?? commandItemValue.navigation(item)}
    >
      <ItemIcon icon={item.icon ?? <PanelTop className="size-4" />} />
      <ItemText
        external={item.external}
        query={query}
        subtitle={matchContext ?? item.subtitle ?? item.href}
        title={item.title}
      />
      <ItemAction label={labels.open} />
    </CommandItem>
  );
}

export function EmptyState({
  labels,
  query,
}: {
  labels: GlobalCommandLauncherLabels;
  query: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl border bg-muted/60 shadow-xs">
        <Search className="size-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">{labels.empty}</p>
        <p className="text-muted-foreground text-sm">
          {query ? `“${query}”` : labels.emptyDescription}
        </p>
      </div>
    </div>
  );
}

function ItemIcon({ icon }: { icon: ReactNode }) {
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground group-data-[selected=true]/row:text-foreground">
      {icon}
    </div>
  );
}

function ItemText({
  badge,
  external,
  query,
  subtitle,
  title,
}: {
  badge?: string;
  external?: boolean;
  query: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="truncate font-medium">
          <HighlightMatch query={query} text={title} />
        </span>
        {external ? (
          <ExternalLink className="size-3 text-muted-foreground" />
        ) : null}
        {badge ? <StatusBadge label={badge} /> : null}
      </div>
      <p className="truncate text-muted-foreground text-xs">
        <HighlightMatch query={query} text={subtitle} />
      </p>
    </div>
  );
}

function ItemAction({ label }: { label: string }) {
  return (
    <>
      <span className="hidden text-muted-foreground text-xs opacity-0 group-data-[selected=true]/row:opacity-100 sm:inline">
        {label}
      </span>
      <ArrowRight className="size-4 text-muted-foreground opacity-0 group-data-[selected=true]/row:opacity-100" />
    </>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <Badge
      className="h-5 rounded-md px-1.5 text-[10px] uppercase"
      variant="outline"
    >
      {label}
    </Badge>
  );
}
