'use client';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { MiraArtifactPanel } from './mira-artifact-panel';
import { useMiraWorkspace } from './mira-workspace-state';

export function MiraWorkspaceLayout({ children }: { children: ReactNode }) {
  const workspace = useMiraWorkspace();
  const count = workspace?.artifacts.length ?? 0;
  const grid =
    count > 1 && (workspace?.layout === 'grid' || workspace?.layout === 'auto');
  const vertical = workspace?.layout === 'vertical';
  return (
    <div
      className={cn(
        'relative z-10 grid min-h-0 flex-1 gap-3 overflow-auto',
        grid && count === 2 && '@3xl:[&>section:last-child]:col-span-2',
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
              key={`${artifact.wsId}:${artifact.kind}:${JSON.stringify(artifact.presentation)}`}
              artifact={artifact}
            />
          ))
        : count > 0 && (
            <div className="grid min-h-0 min-w-0 auto-rows-fr gap-3">
              {workspace?.artifacts.map((artifact) => (
                <MiraArtifactPanel
                  key={`${artifact.wsId}:${artifact.kind}:${JSON.stringify(artifact.presentation)}`}
                  artifact={artifact}
                />
              ))}
            </div>
          )}
    </div>
  );
}
