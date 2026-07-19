import type { ReactNode } from 'react';

function StepNumber({ children }: { children: number }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-background font-mono font-semibold text-xs">
      {children}
    </span>
  );
}

export function SquareSetupStep({
  children,
  number,
}: {
  children: ReactNode;
  number: number;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/15 p-4 md:grid-cols-[auto_minmax(0,1fr)]">
      <StepNumber>{number}</StepNumber>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}
