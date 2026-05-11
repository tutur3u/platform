'use client';

import type { ReactNode } from 'react';

type SatelliteWorkspaceShellProps = {
  bottom?: ReactNode;
  bottomCollapsed?: boolean;
  center: ReactNode;
  left?: ReactNode;
  leftCollapsed?: boolean;
  right?: ReactNode;
  rightCollapsed?: boolean;
  top?: ReactNode;
  topCollapsed?: boolean;
};

export function SatelliteWorkspaceShell({
  bottom,
  bottomCollapsed = false,
  center,
  left,
  leftCollapsed = false,
  right,
  rightCollapsed = false,
  top,
  topCollapsed = false,
}: SatelliteWorkspaceShellProps) {
  return (
    <main
      className="grid h-dvh overflow-hidden bg-background text-foreground"
      style={{
        gridTemplateColumns: `${left && !leftCollapsed ? 'minmax(260px, 300px)' : '0px'} minmax(0, 1fr) ${right && !rightCollapsed ? 'minmax(300px, 360px)' : '0px'}`,
      }}
    >
      <div className="min-h-0 overflow-hidden">{left}</div>
      <section className="relative min-w-0 overflow-hidden">
        {center}
        {top && !topCollapsed ? (
          <div className="pointer-events-none absolute top-4 right-4 left-4 z-20">
            {top}
          </div>
        ) : null}
        {bottom && !bottomCollapsed ? (
          <div className="pointer-events-none absolute right-4 bottom-4 left-4 z-20">
            {bottom}
          </div>
        ) : null}
      </section>
      <div className="min-h-0 overflow-hidden">{right}</div>
    </main>
  );
}
