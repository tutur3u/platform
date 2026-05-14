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
    <main className="relative h-dvh overflow-hidden bg-background text-foreground">
      <section className="absolute inset-0 min-w-0 overflow-hidden">
        {center}
        {top ? (
          <div
            aria-hidden={topCollapsed}
            className={[
              'absolute top-4 right-4 left-4 z-20 transition duration-300 ease-out',
              topCollapsed
                ? 'pointer-events-none invisible -translate-y-4 opacity-0'
                : 'pointer-events-none visible translate-y-0 opacity-100',
            ].join(' ')}
          >
            {top}
          </div>
        ) : null}
        {bottom ? (
          <div
            aria-hidden={bottomCollapsed}
            className={[
              'absolute right-4 bottom-4 left-4 z-20 transition duration-300 ease-out',
              bottomCollapsed
                ? 'pointer-events-none invisible translate-y-4 opacity-0'
                : 'pointer-events-none visible translate-y-0 opacity-100',
            ].join(' ')}
          >
            {bottom}
          </div>
        ) : null}
      </section>
      {left ? (
        <div
          className={[
            'absolute top-4 bottom-4 left-4 z-30 w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/70 shadow-2xl shadow-foreground/15 transition duration-300 ease-out',
            leftCollapsed
              ? 'pointer-events-none -translate-x-[calc(100%+2rem)] opacity-0'
              : 'translate-x-0 opacity-100',
          ].join(' ')}
        >
          {left}
        </div>
      ) : null}
      {right ? (
        <div
          className={[
            'absolute top-4 right-4 bottom-4 z-30 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border/70 shadow-2xl shadow-foreground/15 transition duration-300 ease-out',
            rightCollapsed
              ? 'pointer-events-none translate-x-[calc(100%+2rem)] opacity-0'
              : 'translate-x-0 opacity-100',
          ].join(' ')}
        >
          {right}
        </div>
      ) : null}
    </main>
  );
}
