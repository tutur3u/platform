import type { ReactNode } from 'react';

// One titled section with a single card, matching the Admin section layout.
export function CostSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-base tracking-tight">{title}</h2>
      <div className="rounded-lg border bg-card">{children}</div>
    </section>
  );
}

export function SectionMessage({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'error';
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className="px-4 py-4 text-muted-foreground text-sm md:px-5"
    >
      {children}
    </p>
  );
}
