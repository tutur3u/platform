import { ArrowRight } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CopyButton } from './copy-button';

export function DocsPageHeader({
  badge,
  title,
  description,
  children,
}: {
  badge?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="grid gap-5 pb-8">
      {badge ? (
        <Badge className="w-fit" variant="secondary">
          {badge}
        </Badge>
      ) : null}
      <div className="grid max-w-3xl gap-3">
        <h1 className="text-balance font-semibold text-4xl leading-tight md:text-5xl">
          {title}
        </h1>
        <p className="text-lg text-muted-foreground leading-8">{description}</p>
      </div>
      {children}
    </header>
  );
}

export function DocsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="scroll-mt-24 py-8" id={id}>
      <div className="grid gap-3">
        <h2 className="font-semibold text-2xl">{title}</h2>
        {description ? (
          <p className="max-w-3xl text-muted-foreground leading-7">
            {description}
          </p>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-lg border', className)}
    >
      {label ? (
        <div className="border-b bg-muted/40 px-4 py-2 font-medium text-muted-foreground text-xs">
          {label}
        </div>
      ) : null}
      <pre className="overflow-x-auto bg-muted/20 p-4 pr-14 text-sm leading-6">
        <code>{code}</code>
      </pre>
      <CopyButton code={code} />
    </div>
  );
}

export function LinkGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>{children}</div>
  );
}

export function LinkPanel({
  href,
  title,
  description,
  meta,
}: {
  href: string;
  title: string;
  description: string;
  meta?: string;
}) {
  return (
    <Link
      className="group grid gap-3 rounded-lg border bg-background p-4 transition hover:border-foreground/30 hover:bg-muted/30 focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-4 focus-visible:ring-ring/10"
      href={href}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <p className="text-muted-foreground text-sm leading-6">{description}</p>
      {meta ? (
        <div className="font-medium text-muted-foreground text-xs">{meta}</div>
      ) : null}
    </Link>
  );
}
