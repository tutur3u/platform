import { CheckCircle2 } from '@tuturuuu/icons';
import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { SectionCard } from '../studio/section-card';

export function SectionHeading({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
      </div>
      <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}

export function StepCard({
  description,
  index,
  title,
}: {
  description: string;
  index: string;
  title: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <span className="grid size-6 place-items-center rounded-md bg-foreground/5 font-medium text-muted-foreground text-xs">
        {index}
      </span>
      <div className="mt-3 font-medium text-sm">{title}</div>
      <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
        {description}
      </p>
    </div>
  );
}

export function ExampleCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <SectionCard className="min-w-0" title={title}>
      {children}
    </SectionCard>
  );
}

export function ActionCard({
  description,
  href,
  icon: Icon,
  title,
}: {
  description: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  const body = (
    <div className="h-full rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30">
      <Icon className="mb-3 size-4 text-primary" />
      <div className="font-medium text-sm">{title}</div>
      <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
        {description}
      </p>
    </div>
  );

  return href ? (
    <Link className="block h-full" href={href}>
      {body}
    </Link>
  ) : (
    body
  );
}

export function ProductionChecklist({ items }: { items: readonly string[] }) {
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
      {items.map((item) => (
        <div className="flex items-start gap-2 text-sm" key={item}>
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-dynamic-green" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}
