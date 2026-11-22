import type { ReactNode } from 'react';

/**
 * One fixed stack for every floating bottom control (selection bar, uploads
 * panel, phone New button), so none can cover another. Phones sit above the
 * Sorbet dock and follow its resume correction like the toaster does. Below
 * xl the controls stack in a column; from xl the viewport is wide enough for
 * the centred selection bar beside the uploads panel.
 */
export function DriveBottomStack({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--sorbet-content-bottom-clearance,0px)+1rem-var(--mobile-dock-viewport-drop,0px))] z-30 flex flex-col items-center gap-3 md:inset-x-6 md:bottom-6 xl:flex-row xl:items-end xl:justify-center *:pointer-events-auto"
      data-slot="drive-bottom-stack"
    >
      {children}
    </div>
  );
}
