'use client';

type Props = {
  boardTitle: string;
};

export function MindDashboardHeader({ boardTitle }: Props) {
  return (
    <header className="pointer-events-none absolute top-3 left-3 z-20">
      <div className="pointer-events-auto min-w-0 max-w-[min(24rem,calc(100vw-12rem))] rounded-lg border border-border bg-background/90 px-3 py-2 shadow-foreground/5 shadow-lg backdrop-blur">
        <h2 className="truncate font-semibold text-lg tracking-normal">
          {boardTitle}
        </h2>
      </div>
    </header>
  );
}
