'use client';
import {
  Calendar,
  Columns2,
  Grid2X2,
  ListTodo,
  Rows2,
  Video,
  Wallet,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MiraArtifactPanel } from './mira-artifact-panel';
import {
  type ArtifactLayout,
  artifactKinds,
  useMiraWorkspace,
} from './mira-workspace-state';

const icons = {
  tasks: ListTodo,
  calendar: Calendar,
  finance: Wallet,
  meetings: Video,
};
export function MiraWorkspaceToolbar({ wsId }: { wsId: string }) {
  const t = useTranslations('dashboard.mira_workspace');
  const workspace = useMiraWorkspace();
  if (!workspace) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {artifactKinds.map((kind) => {
        const Icon = icons[kind];
        const active = workspace.artifacts.some(
          (artifact) => artifact.kind === kind && artifact.wsId === wsId
        );
        return (
          <Tooltip key={kind}>
            <TooltipTrigger asChild>
              <Button
                variant={active ? 'secondary' : 'ghost'}
                size="icon"
                className="size-8"
                aria-label={t(kind)}
                aria-pressed={active}
                onClick={() =>
                  active
                    ? workspace.close(kind, wsId)
                    : workspace.open(kind, wsId)
                }
              >
                <Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t(kind)}</TooltipContent>
          </Tooltip>
        );
      })}
      {workspace.artifacts.length > 0 && (
        <div className="ml-1 flex items-center border-l pl-1">
          {(
            [
              ['horizontal', Columns2],
              ['vertical', Rows2],
              ['grid', Grid2X2],
            ] as const
          ).map(([layout, Icon]) => (
            <Tooltip key={layout}>
              <TooltipTrigger asChild>
                <Button
                  variant={workspace.layout === layout ? 'secondary' : 'ghost'}
                  size="icon"
                  className="size-8"
                  aria-label={t(layout)}
                  aria-pressed={workspace.layout === layout}
                  onClick={() => workspace.setLayout(layout as ArtifactLayout)}
                >
                  <Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t(layout)}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}
export function MiraWorkspaceLayout({ children }: { children: ReactNode }) {
  const workspace = useMiraWorkspace();
  const count = workspace?.artifacts.length ?? 0;
  const grid =
    workspace?.layout === 'grid' || (workspace?.layout === 'auto' && count > 1);
  const vertical = workspace?.layout === 'vertical';
  return (
    <div
      className={cn(
        'grid min-h-0 flex-1 gap-3 overflow-auto',
        count === 0
          ? 'grid-cols-1 grid-rows-1'
          : grid
            ? '@3xl:auto-rows-auto auto-rows-[minmax(26rem,1fr)] @3xl:grid-cols-2 grid-cols-1 @3xl:grid-rows-2'
            : vertical
              ? 'grid-cols-1 @3xl:grid-rows-2 grid-rows-[minmax(26rem,1fr)_minmax(20rem,1fr)]'
              : '@3xl:grid-cols-2 grid-cols-1 @3xl:grid-rows-1 grid-rows-[minmax(26rem,1fr)_minmax(20rem,1fr)]'
      )}
    >
      <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card/60 p-3 sm:p-4">
        {children}
      </div>
      {grid
        ? workspace?.artifacts.map((artifact) => (
            <MiraArtifactPanel
              key={`${artifact.wsId}:${artifact.kind}`}
              artifact={artifact}
            />
          ))
        : count > 0 && (
            <div className="grid min-h-0 min-w-0 auto-rows-fr gap-3">
              {workspace?.artifacts.map((artifact) => (
                <MiraArtifactPanel
                  key={`${artifact.wsId}:${artifact.kind}`}
                  artifact={artifact}
                />
              ))}
            </div>
          )}
    </div>
  );
}
