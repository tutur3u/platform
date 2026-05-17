import type { ReactNode } from 'react';

export type MetricCard = {
  detail: string;
  label: string;
  value: string;
};

export type WorkCard = {
  detail: string;
  meta: string;
  title: string;
};

export function PageHeader({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="rounded-lg border border-border bg-card p-6">
      <p className="font-semibold text-dynamic-cyan text-sm uppercase tracking-normal">
        {eyebrow}
      </p>
      <h1 className="mt-2 max-w-3xl font-semibold text-3xl leading-tight md:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">{description}</p>
    </header>
  );
}

export function MetricGrid({ metrics }: { metrics: MetricCard[] }) {
  return (
    <section className="grid gap-3 md:grid-cols-3">
      {metrics.map((metric) => (
        <article
          className="rounded-lg border border-border bg-card p-4"
          key={metric.label}
        >
          <p className="text-muted-foreground text-sm">{metric.label}</p>
          <p className="mt-2 font-semibold text-2xl">{metric.value}</p>
          <p className="mt-2 text-muted-foreground text-xs leading-5">
            {metric.detail}
          </p>
        </article>
      ))}
    </section>
  );
}

export function WorkList({
  cards,
  icon,
  title,
}: {
  cards: WorkCard[];
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 font-semibold text-lg">
        <span className="text-dynamic-cyan">{icon}</span>
        {title}
      </div>
      <div className="mt-4 grid gap-3">
        {cards.map((card) => (
          <article
            className="rounded-lg border border-border bg-background p-4"
            key={card.title}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-medium">{card.title}</h2>
                <p className="mt-1 text-muted-foreground text-sm leading-6">
                  {card.detail}
                </p>
              </div>
              <span className="w-fit rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 px-2 py-1 text-dynamic-blue text-xs">
                {card.meta}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function SplitPanel({
  children,
  secondary,
}: {
  children: ReactNode;
  secondary: ReactNode;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
      {children}
      {secondary}
    </div>
  );
}

export function InsightPanel({
  items,
  title,
}: {
  items: string[];
  title: string;
}) {
  return (
    <aside className="rounded-lg border border-border bg-card p-5">
      <h2 className="font-semibold text-lg">{title}</h2>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <p
            className="rounded-md border border-dynamic-green/20 bg-dynamic-green/10 px-3 py-2 text-dynamic-green text-sm leading-6"
            key={item}
          >
            {item}
          </p>
        ))}
      </div>
    </aside>
  );
}
