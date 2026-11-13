import type { ReactNode } from 'react';

/**
 * Box reserved under the marketing layout's `pt-20` (5rem).
 * The fixed pill is `h-14` plus `pt-3` / `sm:pt-4`, which fits inside 5rem.
 * The fallback and the loaded shell share these classes so streamed content
 * does not move the sidebar, the mobile bar, or the page header.
 */
export const designFrameClass = {
  root: 'flex min-h-[calc(100dvh-5rem)] bg-root-background',
  aside:
    'sticky top-20 z-30 hidden h-[calc(100dvh-5rem)] w-72 shrink-0 border-r bg-background/50 lg:block',
  column: 'flex min-w-0 flex-1 flex-col',
  mobileBar:
    'sticky top-20 z-20 flex h-14 items-center border-b bg-background/95 px-4 backdrop-blur lg:hidden',
  main: 'min-w-0 flex-1 px-4 py-8 md:px-8 lg:px-10',
} as const;

export function DesignFrameFallback(): ReactNode {
  return (
    <div className={designFrameClass.root}>
      <div className={designFrameClass.aside} />
      <div className={designFrameClass.column}>
        <div className={designFrameClass.mobileBar} />
        <div className={designFrameClass.main} />
      </div>
    </div>
  );
}
