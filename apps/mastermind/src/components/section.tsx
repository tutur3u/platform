import type { ReactNode } from 'react';

/** A titled command-center section; the id is the sidebar anchor. */
export function Section({
  id,
  title,
  note,
  actions,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-20 space-y-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2
            id={`${id}-title`}
            className="font-semibold text-base tracking-tight"
          >
            {title}
          </h2>
          {note && (
            <p className="max-w-3xl text-muted-foreground text-sm">{note}</p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Empty or unavailable data inside a section, never a fabricated value. */
export function SectionMessage({
  children,
  tone = 'empty',
}: {
  children: ReactNode;
  tone?: 'empty' | 'error';
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className="rounded-xl border border-dashed px-4 py-6 text-center text-muted-foreground text-sm"
    >
      {children}
    </div>
  );
}

/** A label and value pair in the Why / If no answer / From lists. */
export function Facts({ rows }: { rows: [string, ReactNode | undefined][] }) {
  const shown = rows.filter(([, value]) => value);
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-y-2">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground max-sm:mt-1">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
