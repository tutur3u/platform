'use client';

import type { ReactNode, RefObject } from 'react';

export function MindAiPanelShell({
  children,
  footer,
  fullscreen,
  header,
  scrollRef,
}: {
  children: ReactNode;
  footer: ReactNode;
  fullscreen: boolean;
  header: ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {fullscreen ? (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
      ) : null}
      <aside
        className={
          fullscreen
            ? 'fixed inset-3 z-50 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl shadow-foreground/20 backdrop-blur md:inset-4'
            : 'absolute top-[4.75rem] right-3 bottom-3 left-3 z-30 flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl shadow-foreground/10 backdrop-blur sm:left-auto'
        }
        style={
          fullscreen
            ? undefined
            : {
                maxWidth: 'calc(100vw - 1.5rem)',
                minWidth: 'min(30rem, calc(100vw - 1.5rem))',
                width: 'min(30rem, calc(100vw - 1.5rem))',
              }
        }
      >
        {header}
        <div
          className="@container min-h-0 min-w-0 flex-1 overflow-y-auto p-2.5"
          ref={scrollRef}
        >
          {children}
        </div>
        {footer}
      </aside>
    </>
  );
}
