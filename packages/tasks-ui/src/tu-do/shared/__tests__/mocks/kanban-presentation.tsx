import type { ReactNode } from 'react';

/** Renders the board header and view without the entrance animation. */
export function KanbanPresentation({
  children,
  header,
}: {
  children: ReactNode;
  header: ReactNode;
}) {
  return (
    <>
      {header}
      {children}
    </>
  );
}

/** Renders the board without the side panel frame. */
export function BoardPanelFrame({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
