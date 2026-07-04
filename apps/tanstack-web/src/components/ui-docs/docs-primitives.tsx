import { ArrowRight } from '@tuturuuu/icons/lucide-static';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentType, ReactNode } from 'react';
import type { ShowcaseCategory } from './component-registry';
import { CopyButton } from './copy-button';
import { getAccent } from './ui-docs-theme';

type IconType = ComponentType<{ className?: string }>;

export function DocsPageHeader({
  badge,
  title,
  description,
  children,
  accent,
  pattern,
}: {
  badge?: string;
  title: string;
  description: string;
  children?: ReactNode;
  /** Category accent; omit for the neutral brand accent. */
  accent?: ShowcaseCategory;
  /** Render the premium gradient/grid backdrop (use on landing-style headers). */
  pattern?: boolean;
}) {
  const a = getAccent(accent);

  return (
    <header className="relative grid gap-5 pb-8">
      {pattern ? (
        <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_6%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--foreground)_6%,transparent)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
          <div
            className={cn(
              'absolute -top-24 left-1/4 size-72 rounded-full bg-gradient-to-br opacity-20 blur-3xl',
              a.gradient
            )}
          />
        </div>
      ) : null}
      {badge ? (
        <Badge
          className={cn('w-fit border', a.bg, a.text, a.border)}
          variant="secondary"
        >
          {badge}
        </Badge>
      ) : null}
      <div className="grid max-w-3xl gap-3">
        <h1 className="text-balance bg-gradient-to-br from-foreground via-foreground to-foreground/60 bg-clip-text font-semibold text-4xl text-transparent leading-tight md:text-5xl">
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
  accent,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  accent?: ShowcaseCategory;
}) {
  const a = getAccent(accent);

  return (
    <section className="scroll-mt-24 py-8" id={id}>
      <div className="grid gap-3">
        <div className="flex items-center gap-2.5">
          <span className={cn('size-2 rounded-full', a.dot)} />
          <h2 className="font-semibold text-2xl">{title}</h2>
        </div>
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
  /** Shiki language. Defaults to `tsx` (or `bash` for the terminal label). */
  language?: string;
}) {
  return (
    <div
      className={cn(
        'ui-docs-code group/code relative overflow-hidden rounded-xl border bg-card shadow-sm',
        className
      )}
    >
      <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-dynamic-red/60" />
          <span className="size-2.5 rounded-full bg-dynamic-yellow/60" />
          <span className="size-2.5 rounded-full bg-dynamic-green/60" />
        </span>
        {label ? (
          <span className="ml-1 font-medium font-mono text-muted-foreground text-xs">
            {label}
          </span>
        ) : null}
      </div>
      <div className="[&_pre]:!bg-transparent overflow-x-auto p-4 pr-14 text-sm leading-6">
        <pre className="whitespace-pre">
          <code>{code}</code>
        </pre>
      </div>
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
  accent,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  meta?: string;
  accent?: ShowcaseCategory;
  icon?: IconType;
}) {
  const a = getAccent(accent);

  return (
    <a
      className={cn(
        'group relative grid gap-3 overflow-hidden rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-transparent hover:shadow-md focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-4',
        a.ring
      )}
      href={href}
    >
      <span
        className={cn(
          'absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r transition-transform duration-300 group-hover:scale-x-100',
          a.gradient
        )}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon ? (
            <span
              className={cn(
                'grid size-8 place-items-center rounded-lg border',
                a.bg,
                a.text,
                a.border
              )}
            >
              <Icon className="size-4" />
            </span>
          ) : null}
          <h3 className="font-semibold">{title}</h3>
        </div>
        <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <p className="text-muted-foreground text-sm leading-6">{description}</p>
      {meta ? (
        <div className="font-medium font-mono text-muted-foreground text-xs">
          {meta}
        </div>
      ) : null}
    </a>
  );
}
